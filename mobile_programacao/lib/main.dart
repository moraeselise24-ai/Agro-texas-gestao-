import 'dart:convert';
import 'dart:io';
import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import 'package:http/http.dart' as http;
import 'package:intl/intl.dart';
import 'package:path_provider/path_provider.dart';
import 'package:share_plus/share_plus.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'package:uuid/uuid.dart';

const apiBaseUrl = String.fromEnvironment(
  'API_BASE_URL',
  defaultValue: 'https://inspectcheck-dashboard-walison.fly.dev',
);
const supabaseUrl = String.fromEnvironment(
  'SUPABASE_URL',
  defaultValue: 'https://dfltpmcumnrukkejgbit.supabase.co',
);
const supabaseAnonKey = String.fromEnvironment(
  'SUPABASE_ANON_KEY',
  defaultValue: 'sb_publishable_-sAFWKDqedEr3ixYsYtWzg_0qMErEHk',
);

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await Supabase.initialize(url: supabaseUrl, publishableKey: supabaseAnonKey);
  await NotificationService.instance.init();
  await AppThemeController.instance.load();
  await DistributionQueue.instance.load();
  await LaudoSyncQueue.instance.loadAndResume();
  runApp(const InspectCheckProgramacaoApp());
}

class AppThemeController extends ChangeNotifier {
  AppThemeController._();
  static final instance = AppThemeController._();
  static const key = 'app_theme_mode';
  ThemeMode mode = ThemeMode.dark;

  bool get isLight => mode == ThemeMode.light;

  Future<void> load() async {
    final prefs = await SharedPreferences.getInstance();
    mode = prefs.getString(key) == 'light' ? ThemeMode.light : ThemeMode.dark;
  }

  Future<void> toggle() async {
    mode = isLight ? ThemeMode.dark : ThemeMode.light;
    notifyListeners();
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(key, isLight ? 'light' : 'dark');
  }
}

class NotificationService {
  NotificationService._();
  static final instance = NotificationService._();
  final plugin = FlutterLocalNotificationsPlugin();
  var ready = false;

  Future<void> init() async {
    const android = AndroidInitializationSettings('@mipmap/ic_launcher');
    const settings = InitializationSettings(android: android);
    await plugin.initialize(settings);
    await plugin
        .resolvePlatformSpecificImplementation<
          AndroidFlutterLocalNotificationsPlugin
        >()
        ?.requestNotificationsPermission();
    ready = true;
  }

  Future<void> show({required String title, required String body}) async {
    if (!ready) return;
    const android = AndroidNotificationDetails(
      'inspectcheck_jobs',
      'Processos Inspect Check',
      channelDescription:
          'Avisos de sincronizacao, programacao e distribuicao de O.S.',
      importance: Importance.high,
      priority: Priority.high,
    );
    await plugin.show(
      DateTime.now().millisecondsSinceEpoch ~/ 1000,
      title,
      body,
      const NotificationDetails(android: android),
    );
  }
}

class LocalCache {
  static const classificadoresKey = 'cache_classificadores';
  static const osAtivasKey = 'cache_os_ativas';
  static const historyKey = 'cache_programacoes_history';
  static const laudosHistoryKey = 'cache_laudos_history';

  static String programacaoKey(String date) => 'cache_programacao_$date';

  static Future<void> save(String key, Object? value) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(key, jsonEncode(value));
  }

  static Future<List<dynamic>?> list(String key) async {
    final prefs = await SharedPreferences.getInstance();
    final raw = prefs.getString(key);
    if (raw == null || raw.isEmpty) return null;
    final decoded = jsonDecode(raw);
    return decoded is List ? decoded : null;
  }

  static Future<Map<String, dynamic>?> map(String key) async {
    final prefs = await SharedPreferences.getInstance();
    final raw = prefs.getString(key);
    if (raw == null || raw.isEmpty) return null;
    final decoded = jsonDecode(raw);
    return decoded is Map<String, dynamic> ? decoded : null;
  }
}

class DistributionJob {
  DistributionJob({
    required this.id,
    required this.osId,
    this.detailId,
    required this.classifierName,
    required this.status,
    this.error,
    required this.createdAt,
  });

  final String id;
  final String osId;
  final String? detailId;
  final String classifierName;
  final String status;
  final String? error;
  final DateTime createdAt;

  bool get running => status == 'running' || status == 'pending';

  DistributionJob copyWith({String? status, String? error}) => DistributionJob(
    id: id,
    osId: osId,
    detailId: detailId,
    classifierName: classifierName,
    status: status ?? this.status,
    error: error,
    createdAt: createdAt,
  );

  factory DistributionJob.fromJson(Map<String, dynamic> json) =>
      DistributionJob(
        id: '${json['id']}',
        osId: '${json['osId'] ?? ''}',
        detailId: json['detailId'] as String?,
        classifierName: '${json['classifierName'] ?? ''}',
        status: '${json['status'] ?? 'pending'}',
        error: json['error'] as String?,
        createdAt:
            DateTime.tryParse('${json['createdAt'] ?? ''}') ?? DateTime.now(),
      );

  Map<String, dynamic> toJson() => {
    'id': id,
    'osId': osId,
    'detailId': detailId,
    'classifierName': classifierName,
    'status': status,
    'error': error,
    'createdAt': createdAt.toIso8601String(),
  };
}

class DistributionQueue {
  DistributionQueue._();
  static final instance = DistributionQueue._();
  static const key = 'distribution_jobs';
  final jobs = ValueNotifier<List<DistributionJob>>([]);
  final api = ApiClient();
  final _active = <String>{};

  Future<void> load() async {
    final list = await LocalCache.list(key);
    jobs.value =
        ((list ?? [])
                .whereType<Map<String, dynamic>>()
                .map(DistributionJob.fromJson)
                .where(
                  (job) => job.osId.isNotEmpty && job.classifierName.isNotEmpty,
                )
                .toList())
            .take(20)
            .toList();
  }

  Future<void> loadAndResume() async {
    await load();
    for (final job in jobs.value.where((job) => job.running)) {
      _process(job.copyWith(status: 'pending'));
    }
  }

  Future<void> enqueue({
    required OsAtiva os,
    required Classificador classificador,
  }) async {
    final job = DistributionJob(
      id: const Uuid().v4(),
      osId: os.osId,
      detailId: os.detailId,
      classifierName: classificador.nome,
      status: 'pending',
      createdAt: DateTime.now(),
    );
    jobs.value = [job, ...jobs.value].take(20).toList();
    await _persist();
    _process(job);
  }

  Future<void> _persist() =>
      LocalCache.save(key, jobs.value.map((job) => job.toJson()).toList());

  void _replace(DistributionJob next) {
    jobs.value = jobs.value
        .map((job) => job.id == next.id ? next : job)
        .toList();
    _persist();
  }

  Future<void> _process(DistributionJob job) async {
    if (_active.contains(job.id)) return;
    _active.add(job.id);
    _replace(job.copyWith(status: 'running'));
    try {
      await api.post('/api/classific/os-classificador', {
        'osId': job.osId,
        'detailId': job.detailId,
        'classifierName': job.classifierName,
      });
      _replace(job.copyWith(status: 'done'));
      await NotificationService.instance.show(
        title: 'Distribuicao de O.S. concluida',
        body: '${job.osId} alterada para ${job.classifierName}.',
      );
    } catch (e) {
      _replace(job.copyWith(status: 'error', error: '$e'));
      await NotificationService.instance.show(
        title: 'Falha na distribuicao de O.S.',
        body: '${job.osId}: $e',
      );
    } finally {
      _active.remove(job.id);
    }
  }
}

class InspectCheckProgramacaoApp extends StatelessWidget {
  const InspectCheckProgramacaoApp({super.key});

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: AppThemeController.instance,
      builder: (context, _) {
        return MaterialApp(
          title: 'Inspect Check',
          debugShowCheckedModeBanner: false,
          themeMode: AppThemeController.instance.mode,
          theme: buildLightTheme(),
          darkTheme: buildDarkTheme(),
          builder: (context, child) => Stack(
            children: [
              const Positioned.fill(child: AgroHudBackground()),
              child ?? const SizedBox.shrink(),
            ],
          ),
          home: const AuthGate(),
        );
      },
    );
  }
}

ThemeData buildDarkTheme() {
  return ThemeData(
    brightness: Brightness.dark,
    colorScheme: ColorScheme.fromSeed(
      seedColor: const Color(0xFFF58220),
      primary: const Color(0xFFF58220),
      secondary: const Color(0xFF6FE37A),
      surface: const Color(0xFF0A1412),
      brightness: Brightness.dark,
    ),
    scaffoldBackgroundColor: Colors.transparent,
    canvasColor: const Color(0xFF050A09),
    useMaterial3: true,
    textTheme: ThemeData.dark().textTheme.apply(
      bodyColor: const Color(0xFFE0F2F1),
      displayColor: Colors.white,
    ),
    inputDecorationTheme: cyberInputTheme(isLight: false),
    filledButtonTheme: FilledButtonThemeData(style: buttonStyle()),
    outlinedButtonTheme: cyberOutlinedButtonTheme(isLight: false),
    iconButtonTheme: cyberIconButtonTheme(isLight: false),
    checkboxTheme: cyberCheckboxTheme(isLight: false),
    chipTheme: cyberChipTheme(isLight: false),
    dividerTheme: const DividerThemeData(color: Color(0x333B6E3D)),
  );
}

ThemeData buildLightTheme() {
  return ThemeData(
    brightness: Brightness.light,
    colorScheme: ColorScheme.fromSeed(
      seedColor: const Color(0xFFF58220),
      primary: const Color(0xFFD96F11),
      secondary: const Color(0xFF2E7D32),
      surface: const Color(0xFFF7FBF3),
      brightness: Brightness.light,
    ),
    scaffoldBackgroundColor: Colors.transparent,
    canvasColor: const Color(0xFFF2F6ED),
    useMaterial3: true,
    textTheme: ThemeData.light().textTheme.apply(
      bodyColor: const Color(0xFF10211C),
      displayColor: const Color(0xFF07100E),
    ),
    inputDecorationTheme: cyberInputTheme(isLight: true),
    filledButtonTheme: FilledButtonThemeData(style: buttonStyle()),
    outlinedButtonTheme: cyberOutlinedButtonTheme(isLight: true),
    iconButtonTheme: cyberIconButtonTheme(isLight: true),
    checkboxTheme: cyberCheckboxTheme(isLight: true),
    chipTheme: cyberChipTheme(isLight: true),
    dividerTheme: const DividerThemeData(color: Color(0x333B6E3D)),
  );
}

InputDecorationTheme cyberInputTheme({required bool isLight}) {
  final fill = isLight ? const Color(0xEFFFFFFF) : const Color(0xCC101A24);
  final label = isLight ? const Color(0xAA24443A) : const Color(0xCCA3CFCB);
  final border = isLight ? const Color(0x663B6E3D) : const Color(0x443B6E3D);
  return InputDecorationTheme(
    filled: true,
    fillColor: fill,
    labelStyle: TextStyle(color: label),
    hintStyle: TextStyle(color: label.withValues(alpha: 0.7)),
    border: OutlineInputBorder(
      borderRadius: BorderRadius.circular(16),
      borderSide: BorderSide(color: border),
    ),
    enabledBorder: OutlineInputBorder(
      borderRadius: BorderRadius.circular(16),
      borderSide: BorderSide(color: border),
    ),
    focusedBorder: OutlineInputBorder(
      borderRadius: BorderRadius.circular(16),
      borderSide: const BorderSide(color: Color(0xFFF58220), width: 1.3),
    ),
  );
}

OutlinedButtonThemeData cyberOutlinedButtonTheme({required bool isLight}) {
  return OutlinedButtonThemeData(
    style: OutlinedButton.styleFrom(
      foregroundColor: isLight
          ? const Color(0xFF10211C)
          : const Color(0xFFE0F2F1),
      side: const BorderSide(color: Color(0x66F58220)),
      backgroundColor: isLight
          ? const Color(0xBBFFFFFF)
          : const Color(0x33101A24),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
    ),
  );
}

IconButtonThemeData cyberIconButtonTheme({required bool isLight}) {
  return IconButtonThemeData(
    style: IconButton.styleFrom(
      foregroundColor: const Color(0xFFFF8A1F),
      backgroundColor: isLight
          ? const Color(0x26F58220)
          : const Color(0x22F58220),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
    ),
  );
}

CheckboxThemeData cyberCheckboxTheme({required bool isLight}) {
  return CheckboxThemeData(
    fillColor: WidgetStateProperty.resolveWith(
      (states) => states.contains(WidgetState.selected)
          ? const Color(0xFF8EDCB8)
          : (isLight ? const Color(0x44FFFFFF) : const Color(0x33101A24)),
    ),
    checkColor: const WidgetStatePropertyAll(Color(0xFF052019)),
    side: BorderSide(
      color: isLight ? const Color(0x993B6E3D) : const Color(0x88A3CFCB),
    ),
  );
}

ChipThemeData cyberChipTheme({required bool isLight}) {
  return ChipThemeData(
    backgroundColor: isLight
        ? const Color(0xCCFFFFFF)
        : const Color(0x33101A24),
    side: const BorderSide(color: Color(0x553B6E3D)),
    labelStyle: TextStyle(
      color: isLight ? const Color(0xFF10211C) : const Color(0xFFE0F2F1),
    ),
    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
  );
}

class AuthGate extends StatelessWidget {
  const AuthGate({super.key});

  @override
  Widget build(BuildContext context) {
    return StreamBuilder<AuthState>(
      stream: Supabase.instance.client.auth.onAuthStateChange,
      builder: (context, _) {
        final session = Supabase.instance.client.auth.currentSession;
        return session == null ? const LoginPage() : const HomePage();
      },
    );
  }
}

class LoginPage extends StatefulWidget {
  const LoginPage({super.key});

  @override
  State<LoginPage> createState() => _LoginPageState();
}

class _LoginPageState extends State<LoginPage> {
  static const savedEmailKey = 'saved_login_email';
  static const savedPasswordKey = 'saved_login_password';
  final emailController = TextEditingController();
  final passwordController = TextEditingController();
  var loading = false;
  var rememberUser = false;

  @override
  void initState() {
    super.initState();
    loadSavedUser();
  }

  Future<void> loadSavedUser() async {
    final prefs = await SharedPreferences.getInstance();
    final savedEmail = prefs.getString(savedEmailKey) ?? '';
    final savedPassword = prefs.getString(savedPasswordKey) ?? '';
    if (!mounted || (savedEmail.isEmpty && savedPassword.isEmpty)) return;
    setState(() {
      emailController.text = savedEmail;
      passwordController.text = savedPassword;
      rememberUser = savedEmail.isNotEmpty || savedPassword.isNotEmpty;
    });
  }

  @override
  void dispose() {
    emailController.dispose();
    passwordController.dispose();
    super.dispose();
  }

  Future<void> signIn() async {
    setState(() => loading = true);
    try {
      final email = emailController.text.trim();
      await Supabase.instance.client.auth.signInWithPassword(
        email: email,
        password: passwordController.text,
      );
      final prefs = await SharedPreferences.getInstance();
      if (rememberUser) {
        await prefs.setString(savedEmailKey, email);
        await prefs.setString(savedPasswordKey, passwordController.text);
      } else {
        await prefs.remove(savedEmailKey);
        await prefs.remove(savedPasswordKey);
      }
    } catch (e) {
      if (mounted) showError(context, 'Falha no login: $e');
    } finally {
      if (mounted) setState(() => loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.transparent,
      body: Stack(
        children: [
          Positioned.fill(
            child: Image.asset(
              'assets/images/classificador1.png',
              fit: BoxFit.cover,
            ),
          ),
          Positioned.fill(
            child: DecoratedBox(
              decoration: BoxDecoration(
                gradient: LinearGradient(
                  begin: Alignment.topCenter,
                  end: Alignment.bottomCenter,
                  colors: [
                    const Color(0xFF050A09).withValues(alpha: 0.56),
                    const Color(0xFF050A09).withValues(alpha: 0.72),
                    const Color(0xFF050A09).withValues(alpha: 0.88),
                  ],
                ),
              ),
            ),
          ),
          SafeArea(
            child: LayoutBuilder(
              builder: (context, constraints) {
                return SingleChildScrollView(
                  padding: const EdgeInsets.fromLTRB(24, 18, 24, 24),
                  child: ConstrainedBox(
                    constraints: BoxConstraints(
                      minHeight: constraints.maxHeight - 42,
                    ),
                    child: Column(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        Image.asset(
                          'assets/images/logo.png',
                          width: 270,
                          fit: BoxFit.contain,
                          color: Colors.white,
                          colorBlendMode: BlendMode.srcIn,
                        ),
                        const SizedBox(height: 34),
                        ClipRRect(
                          borderRadius: BorderRadius.circular(18),
                          child: BackdropFilter(
                            filter: ui.ImageFilter.blur(sigmaX: 18, sigmaY: 18),
                            child: Container(
                              padding: const EdgeInsets.fromLTRB(
                                18,
                                20,
                                18,
                                18,
                              ),
                              decoration: BoxDecoration(
                                color: const Color(
                                  0xFF07100E,
                                ).withValues(alpha: 0.78),
                                borderRadius: BorderRadius.circular(18),
                                border: Border.all(
                                  color: Colors.white.withValues(alpha: 0.18),
                                ),
                                boxShadow: [
                                  BoxShadow(
                                    color: Colors.black.withValues(alpha: 0.36),
                                    blurRadius: 34,
                                    offset: const Offset(0, 18),
                                  ),
                                  BoxShadow(
                                    color: const Color(
                                      0xFFF58220,
                                    ).withValues(alpha: 0.12),
                                    blurRadius: 20,
                                  ),
                                ],
                              ),
                              child: Column(
                                children: [
                                  const Align(
                                    alignment: Alignment.centerLeft,
                                    child: Text(
                                      'E-mail',
                                      style: TextStyle(
                                        color: Colors.white,
                                        fontSize: 14,
                                        fontWeight: FontWeight.w800,
                                      ),
                                    ),
                                  ),
                                  const SizedBox(height: 6),
                                  TextField(
                                    controller: emailController,
                                    keyboardType: TextInputType.emailAddress,
                                    textInputAction: TextInputAction.next,
                                    style: const TextStyle(
                                      color: Color(0xFF07100E),
                                      fontWeight: FontWeight.w800,
                                    ),
                                    decoration: const InputDecoration(
                                      hintText: 'usuario@empresa.com',
                                      fillColor: Color(0xD9FFFFFF),
                                      floatingLabelBehavior:
                                          FloatingLabelBehavior.never,
                                    ),
                                  ),
                                  const SizedBox(height: 14),
                                  const Align(
                                    alignment: Alignment.centerLeft,
                                    child: Text(
                                      'Senha',
                                      style: TextStyle(
                                        color: Colors.white,
                                        fontSize: 14,
                                        fontWeight: FontWeight.w800,
                                      ),
                                    ),
                                  ),
                                  const SizedBox(height: 6),
                                  TextField(
                                    controller: passwordController,
                                    obscureText: true,
                                    onSubmitted: (_) => signIn(),
                                    style: const TextStyle(
                                      color: Color(0xFF07100E),
                                      fontWeight: FontWeight.w800,
                                    ),
                                    decoration: const InputDecoration(
                                      hintText: 'Senha',
                                      fillColor: Color(0xD9FFFFFF),
                                      floatingLabelBehavior:
                                          FloatingLabelBehavior.never,
                                    ),
                                  ),
                                  const SizedBox(height: 10),
                                  CheckboxListTile(
                                    value: rememberUser,
                                    onChanged: (value) => setState(
                                      () => rememberUser = value ?? false,
                                    ),
                                    contentPadding: EdgeInsets.zero,
                                    controlAffinity:
                                        ListTileControlAffinity.leading,
                                    title: const Text(
                                      'Salvar usuário e senha',
                                      style: TextStyle(
                                        color: Colors.white,
                                        fontWeight: FontWeight.w800,
                                      ),
                                    ),
                                    subtitle: Text(
                                      'Mantem o login preenchido neste aparelho.',
                                      style: TextStyle(
                                        color: Colors.white.withValues(
                                          alpha: 0.76,
                                        ),
                                        fontWeight: FontWeight.w500,
                                      ),
                                    ),
                                  ),
                                  const SizedBox(height: 14),
                                  FilledButton.icon(
                                    onPressed: loading ? null : signIn,
                                    icon: loading
                                        ? const SizedBox(
                                            width: 18,
                                            height: 18,
                                            child: CircularProgressIndicator(
                                              strokeWidth: 2,
                                            ),
                                          )
                                        : const Icon(Icons.login),
                                    label: const Text('Entrar'),
                                    style: FilledButton.styleFrom(
                                      minimumSize: const Size.fromHeight(56),
                                      shape: RoundedRectangleBorder(
                                        borderRadius: BorderRadius.circular(18),
                                      ),
                                    ),
                                  ),
                                ],
                              ),
                            ),
                          ),
                        ),
                        const SizedBox(height: 18),
                        Text(
                          'Inspect Check • versão 2.4.0 • 2026',
                          textAlign: TextAlign.center,
                          style: TextStyle(
                            color: Colors.white.withValues(alpha: 0.82),
                            fontSize: 12,
                            fontWeight: FontWeight.w700,
                            letterSpacing: 0.8,
                          ),
                        ),
                      ],
                    ),
                  ),
                );
              },
            ),
          ),
        ],
      ),
    );
  }
}

class HomePage extends StatefulWidget {
  const HomePage({super.key});

  @override
  State<HomePage> createState() => _HomePageState();
}

class _HomePageState extends State<HomePage> {
  @override
  void initState() {
    super.initState();
    DistributionQueue.instance.loadAndResume();
    LaudoSyncQueue.instance.loadAndResume();
    LaudoSyncQueue.instance.items.addListener(syncLaudos);
  }

  @override
  void dispose() {
    LaudoSyncQueue.instance.items.removeListener(syncLaudos);
    super.dispose();
  }

  void syncLaudos() {
    if (mounted) setState(() {});
  }

  @override
  Widget build(BuildContext context) {
    final pendingLaudos = LaudoSyncQueue.instance.items.value
        .where((item) => item.syncing || item.failed)
        .length;
    final user = Supabase.instance.client.auth.currentUser;
    final userName = (user?.userMetadata?['name'] ?? user?.email ?? 'Usuário')
        .toString();
    final isLight = Theme.of(context).brightness == Brightness.light;
    return Scaffold(
      backgroundColor: const Color(0xFF050A09),
      body: MediaQuery(
        data: MediaQuery.of(
          context,
        ).copyWith(textScaler: const TextScaler.linear(1)),
        child: SafeArea(
          child: Stack(
            children: [
              const Positioned.fill(child: AgroHudBackground()),
              Column(
                children: [
                  Container(
                    height: 70,
                    padding: const EdgeInsets.fromLTRB(18, 10, 18, 10),
                    decoration: BoxDecoration(
                      color: (isLight ? Colors.white : const Color(0xFF050A09))
                          .withValues(alpha: isLight ? 0.74 : 0.86),
                      border: const Border(
                        bottom: BorderSide(color: Color(0x33245220)),
                      ),
                    ),
                    child: Row(
                      children: [
                        Container(
                          width: 46,
                          height: 46,
                          padding: const EdgeInsets.all(7),
                          decoration: BoxDecoration(
                            color: isLight
                                ? Colors.white.withValues(alpha: 0.72)
                                : const Color(0xFF0A1412),
                            borderRadius: BorderRadius.circular(8),
                            boxShadow: const [
                              BoxShadow(
                                color: Color(0x55200000),
                                blurRadius: 18,
                                offset: Offset(0, 8),
                              ),
                            ],
                          ),
                          child: Image.asset('assets/images/logo_mini.png'),
                        ),
                        const SizedBox(width: 14),
                        Expanded(
                          child: Text(
                            'Inspect Check',
                            style: TextStyle(
                              color: isLight
                                  ? const Color(0xFF07100E)
                                  : Colors.white,
                              fontSize: 26,
                              height: 1,
                              fontWeight: FontWeight.w900,
                              letterSpacing: -0.2,
                            ),
                          ),
                        ),
                        HudSquareButton(
                          icon: Icons.logout,
                          onTap: () => Supabase.instance.client.auth.signOut(),
                        ),
                      ],
                    ),
                  ),
                  Expanded(
                    child: ListView(
                      padding: const EdgeInsets.fromLTRB(18, 20, 18, 174),
                      children: [
                        RichText(
                          text: TextSpan(
                            style: TextStyle(
                              color: isLight
                                  ? const Color(0xFF07100E)
                                  : Colors.white,
                              fontSize: 31,
                              fontWeight: FontWeight.w900,
                              height: 1.18,
                            ),
                            children: [
                              TextSpan(text: 'Seja bem vindo ao sistema da\n'),
                              TextSpan(
                                text: 'Inspect Check',
                                style: TextStyle(
                                  color: Color(0xFFF58220),
                                  shadows: [
                                    Shadow(
                                      color: Color(0x88F58220),
                                      blurRadius: 16,
                                    ),
                                  ],
                                ),
                              ),
                            ],
                          ),
                        ),
                        const SizedBox(height: 18),
                        Text(
                          'Gerencie cronogramas, ordens de serviço e laudos técnicos com precisão técnica e performance otimizada.',
                          style: TextStyle(
                            color: isLight
                                ? const Color(0xFF33544C)
                                : const Color(0xFFA3CFCB),
                            fontSize: 16,
                            height: 1.45,
                            fontWeight: FontWeight.w500,
                          ),
                        ),
                        const SizedBox(height: 24),
                        Row(
                          children: [
                            Expanded(
                              child: CyberModuleCard(
                                icon: Icons.calendar_month,
                                title: 'Programação',
                                subtitle: 'CRIAR UMA NOVA\nPROGRAMAÇÃO',
                                action: 'ACESSAR',
                                accent: const Color(0xFFF58220),
                                imageAsset: 'assets/images/silos.png',
                                onTap: () => Navigator.of(context).push(
                                  MaterialPageRoute(
                                    builder: (_) => const ProgramacaoPage(),
                                  ),
                                ),
                              ),
                            ),
                            const SizedBox(width: 14),
                            Expanded(
                              child: CyberModuleCard(
                                icon: Icons.account_tree_outlined,
                                title: 'Distribuição',
                                subtitle: 'LANÇAMENTOS DE O.S',
                                action: 'ATIVO',
                                accent: const Color(0xFF6FE37A),
                                imageAsset: 'assets/images/trator.png',
                                onTap: () => Navigator.of(context).push(
                                  MaterialPageRoute(
                                    builder: (_) => const DistribuicaoOsPage(),
                                  ),
                                ),
                              ),
                            ),
                          ],
                        ),
                        const SizedBox(height: 16),
                        CyberWideCard(
                          icon: Icons.description_outlined,
                          title: 'Fazer Laudo',
                          subtitle: 'LANÇAMENTOS DE LAUDOS TÉCNICOS',
                          imageAsset: 'assets/images/homem.png',
                          onTap: () => Navigator.of(context).push(
                            MaterialPageRoute(
                              builder: (_) => const LaudosPage(),
                            ),
                          ),
                        ),
                        const SizedBox(height: 28),
                        CyberStatusPanel(
                          pendingLaudos: pendingLaudos,
                          userName: userName,
                        ),
                      ],
                    ),
                  ),
                ],
              ),
              CyberBottomNav(
                onProgramacao: () => Navigator.of(context).push(
                  MaterialPageRoute(builder: (_) => const ProgramacaoPage()),
                ),
                onDistribuicao: () => Navigator.of(context).push(
                  MaterialPageRoute(builder: (_) => const DistribuicaoOsPage()),
                ),
                onLaudo: () => Navigator.of(
                  context,
                ).push(MaterialPageRoute(builder: (_) => const LaudosPage())),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class AgroHudBackground extends StatelessWidget {
  const AgroHudBackground({super.key});

  @override
  Widget build(BuildContext context) {
    final isLight = Theme.of(context).brightness == Brightness.light;
    return DecoratedBox(
      decoration: BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.topCenter,
          end: Alignment.bottomCenter,
          colors: isLight
              ? const [Color(0xFFF7FBF3), Color(0xFFEAF2E5), Color(0xFFF8FBF4)]
              : const [Color(0xFF07100E), Color(0xFF030807), Color(0xFF050A09)],
        ),
      ),
      child: CustomPaint(painter: AgroHudPainter(isLight: isLight)),
    );
  }
}

class AgroHudPainter extends CustomPainter {
  const AgroHudPainter({required this.isLight});

  final bool isLight;

  @override
  void paint(Canvas canvas, Size size) {
    final gridPaint = Paint()
      ..color = isLight ? const Color(0x1A6D8A72) : const Color(0x111F3322)
      ..strokeWidth = 1;
    for (var x = 0.0; x < size.width; x += 56) {
      canvas.drawLine(Offset(x, 0), Offset(x, size.height), gridPaint);
    }
    for (var y = 36.0; y < size.height; y += 72) {
      canvas.drawLine(Offset(0, y), Offset(size.width, y), gridPaint);
    }

    final glowPaint = Paint()
      ..shader = ui.Gradient.radial(
        Offset(size.width * 0.12, size.height * 0.16),
        size.width * 0.9,
        isLight
            ? const [Color(0x55CFE5C9), Color(0x00F7FBF3)]
            : const [Color(0x553B6E3D), Color(0x00050A09)],
      );
    canvas.drawRect(Offset.zero & size, glowPaint);

    final linePaint = Paint()
      ..color = isLight ? const Color(0x30F58220) : const Color(0x18F58220)
      ..strokeWidth = 1.2;
    canvas.drawLine(
      Offset(size.width * 0.72, size.height * 0.64),
      Offset(size.width * 0.96, size.height * 0.42),
      linePaint,
    );
    canvas.drawLine(
      Offset(size.width * 0.22, size.height * 0.86),
      Offset(size.width * 0.38, size.height * 0.70),
      linePaint,
    );
  }

  @override
  bool shouldRepaint(covariant AgroHudPainter oldDelegate) =>
      oldDelegate.isLight != isLight;
}

class HudSquareButton extends StatelessWidget {
  const HudSquareButton({super.key, required this.icon, required this.onTap});

  final IconData icon;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(7),
        child: Container(
          width: 36,
          height: 36,
          decoration: BoxDecoration(
            color: const Color(0x22F58220),
            borderRadius: BorderRadius.circular(6),
            border: Border.all(color: const Color(0x66F58220)),
            boxShadow: const [
              BoxShadow(color: Color(0x22F58220), blurRadius: 18),
            ],
          ),
          child: Icon(icon, color: const Color(0xFFFF8A1F), size: 21),
        ),
      ),
    );
  }
}

class CyberModuleCard extends StatefulWidget {
  const CyberModuleCard({
    super.key,
    required this.icon,
    required this.title,
    required this.subtitle,
    required this.action,
    required this.accent,
    required this.imageAsset,
    required this.onTap,
  });

  final IconData icon;
  final String title;
  final String subtitle;
  final String action;
  final Color accent;
  final String imageAsset;
  final VoidCallback onTap;

  @override
  State<CyberModuleCard> createState() => _CyberModuleCardState();
}

class _CyberModuleCardState extends State<CyberModuleCard> {
  var pressed = false;

  @override
  Widget build(BuildContext context) {
    final isLight = Theme.of(context).brightness == Brightness.light;
    final titleColor = Colors.white;
    return GestureDetector(
      onTapDown: (_) => setState(() => pressed = true),
      onTapCancel: () => setState(() => pressed = false),
      onTapUp: (_) => setState(() => pressed = false),
      onTap: widget.onTap,
      child: AnimatedScale(
        scale: pressed ? 0.98 : 1,
        duration: const Duration(milliseconds: 90),
        child: Container(
          height: 160,
          padding: const EdgeInsets.all(14),
          decoration: cyberCardDecoration(widget.accent, isLight: isLight),
          clipBehavior: Clip.antiAlias,
          child: Stack(
            children: [
              Positioned.fill(
                child: CyberCardImage(
                  asset: widget.imageAsset,
                  accent: widget.accent,
                ),
              ),
              Positioned(
                top: 0,
                right: 0,
                child: CyberCorner(accent: widget.accent),
              ),
              Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  NeonIconBox(
                    icon: widget.icon,
                    color: widget.accent,
                    size: 48,
                  ),
                  const Spacer(),
                  Text(
                    widget.title,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(
                      color: titleColor,
                      fontSize: 17,
                      fontWeight: FontWeight.w900,
                      shadows: [
                        Shadow(
                          color: Colors.black.withValues(
                            alpha: isLight ? 0.92 : 1,
                          ),
                          blurRadius: isLight ? 14 : 8,
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(height: 8),
                  Text(
                    widget.subtitle,
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(
                      color: isLight
                          ? widget.accent
                          : widget.accent.withValues(alpha: 0.82),
                      fontSize: 11,
                      height: 1.18,
                      fontWeight: FontWeight.w800,
                      letterSpacing: 1.3,
                    ),
                  ),
                  const SizedBox(height: 12),
                  Row(
                    children: [
                      Text(
                        widget.action,
                        style: TextStyle(
                          color: widget.accent,
                          fontSize: 12,
                          fontWeight: FontWeight.w900,
                          letterSpacing: 2,
                        ),
                      ),
                      const SizedBox(width: 8),
                      Icon(Icons.arrow_forward, color: widget.accent, size: 20),
                    ],
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class CyberWideCard extends StatelessWidget {
  const CyberWideCard({
    super.key,
    required this.icon,
    required this.title,
    required this.subtitle,
    required this.imageAsset,
    required this.onTap,
  });

  final IconData icon;
  final String title;
  final String subtitle;
  final String imageAsset;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    const accent = Color(0xFFF58220);
    final isLight = Theme.of(context).brightness == Brightness.light;
    final titleColor = Colors.white;
    return Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: onTap,
        child: Container(
          height: 104,
          padding: const EdgeInsets.all(16),
          decoration: cyberCardDecoration(accent, isLight: isLight),
          clipBehavior: Clip.antiAlias,
          child: Stack(
            children: [
              Positioned.fill(
                child: CyberCardImage(asset: imageAsset, accent: accent),
              ),
              const Positioned(top: 0, right: 0, child: CyberCorner()),
              Row(
                children: [
                  NeonIconBox(icon: icon, color: accent, size: 58),
                  const SizedBox(width: 18),
                  Expanded(
                    child: Column(
                      mainAxisAlignment: MainAxisAlignment.center,
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          title,
                          style: TextStyle(
                            color: titleColor,
                            fontSize: 22,
                            fontWeight: FontWeight.w900,
                            shadows: [
                              Shadow(
                                color: Colors.black.withValues(
                                  alpha: isLight ? 0.92 : 1,
                                ),
                                blurRadius: isLight ? 14 : 8,
                              ),
                            ],
                          ),
                        ),
                        const SizedBox(height: 8),
                        Text(
                          subtitle,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: TextStyle(
                            color: isLight
                                ? const Color(0xFFFF7A12)
                                : const Color(0xCCF58220),
                            fontSize: 12,
                            fontWeight: FontWeight.w800,
                            letterSpacing: 1.2,
                          ),
                        ),
                      ],
                    ),
                  ),
                  Container(
                    width: 52,
                    height: 52,
                    decoration: BoxDecoration(
                      color: Colors.white.withValues(alpha: 0.04),
                      shape: BoxShape.circle,
                      border: Border.all(
                        color: Colors.white.withValues(alpha: 0.16),
                      ),
                    ),
                    child: Icon(
                      Icons.chevron_right,
                      color: isLight
                          ? const Color(0xAA07100E)
                          : const Color(0x99FFFFFF),
                      size: 34,
                    ),
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class CyberStatusPanel extends StatelessWidget {
  const CyberStatusPanel({
    super.key,
    required this.pendingLaudos,
    required this.userName,
  });

  final int pendingLaudos;
  final String userName;

  @override
  Widget build(BuildContext context) {
    final isLight = Theme.of(context).brightness == Brightness.light;
    final message = pendingLaudos == 0
        ? 'ONLINE & OPERANTE'
        : '$pendingLaudos PENDENTE${pendingLaudos == 1 ? '' : 'S'}';
    return Container(
      padding: const EdgeInsets.fromLTRB(18, 20, 18, 18),
      decoration: BoxDecoration(
        color: isLight
            ? Colors.white.withValues(alpha: 0.96)
            : const Color(0xDD0A1412),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: const Color(0x663B260F)),
        boxShadow: const [
          BoxShadow(
            color: Color(0xAA000000),
            blurRadius: 28,
            offset: Offset(0, 18),
          ),
        ],
      ),
      child: Column(
        children: [
          Row(
            children: [
              Expanded(
                child: _StatusColumn(
                  label: 'STATUS DO SISTEMA',
                  value: message,
                  dot: true,
                ),
              ),
              const _StatusColumn(
                label: 'VERSÃO',
                value: 'CORPORATE 2.4.0',
                alignEnd: true,
              ),
            ],
          ),
          Container(
            margin: const EdgeInsets.symmetric(vertical: 18),
            height: 1,
            color: const Color(0x33245220),
          ),
          Row(
            children: [
              Container(
                width: 52,
                height: 52,
                padding: const EdgeInsets.all(4),
                decoration: BoxDecoration(
                  color: isLight
                      ? const Color(0xFFF1F6EC)
                      : const Color(0xFF050A09),
                  borderRadius: BorderRadius.circular(5),
                  border: Border.all(color: const Color(0x663B6E3D)),
                ),
                child: const Icon(
                  Icons.person,
                  color: Color(0xFFF58220),
                  size: 32,
                ),
              ),
              const SizedBox(width: 14),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      userName,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(
                        color: isLight ? const Color(0xFF03110E) : Colors.white,
                        fontSize: 18,
                        fontWeight: FontWeight.w900,
                      ),
                    ),
                    const SizedBox(height: 5),
                    const Text(
                      'OPERADOR INSPECT CHECK',
                      style: TextStyle(
                        color: Color(0xFFF58220),
                        fontSize: 12,
                        fontWeight: FontWeight.w800,
                        letterSpacing: 1.8,
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _StatusColumn extends StatelessWidget {
  const _StatusColumn({
    required this.label,
    required this.value,
    this.dot = false,
    this.alignEnd = false,
  });

  final String label;
  final String value;
  final bool dot;
  final bool alignEnd;

  @override
  Widget build(BuildContext context) {
    final isLight = Theme.of(context).brightness == Brightness.light;
    return Column(
      crossAxisAlignment: alignEnd
          ? CrossAxisAlignment.end
          : CrossAxisAlignment.start,
      children: [
        Text(
          label,
          style: TextStyle(
            color: isLight ? const Color(0xFF245220) : const Color(0xAA4A8A4D),
            fontSize: 11,
            fontWeight: FontWeight.w800,
            letterSpacing: 1.4,
          ),
        ),
        const SizedBox(height: 12),
        Row(
          mainAxisAlignment: alignEnd
              ? MainAxisAlignment.end
              : MainAxisAlignment.start,
          children: [
            if (dot) ...[const PulseDot(), const SizedBox(width: 9)],
            Flexible(
              child: Text(
                value,
                textAlign: alignEnd ? TextAlign.right : TextAlign.left,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: TextStyle(
                  color: isLight ? const Color(0xFF07100E) : Colors.white,
                  fontSize: 14,
                  fontWeight: FontWeight.w900,
                  letterSpacing: 1.4,
                ),
              ),
            ),
          ],
        ),
      ],
    );
  }
}

class PulseDot extends StatelessWidget {
  const PulseDot({super.key});

  @override
  Widget build(BuildContext context) {
    return Container(
      width: 9,
      height: 9,
      decoration: const BoxDecoration(
        color: Color(0xFF4A8A4D),
        shape: BoxShape.circle,
        boxShadow: [
          BoxShadow(color: Color(0x884A8A4D), blurRadius: 12, spreadRadius: 2),
        ],
      ),
    );
  }
}

class CyberBottomNav extends StatelessWidget {
  const CyberBottomNav({
    super.key,
    required this.onProgramacao,
    required this.onDistribuicao,
    required this.onLaudo,
  });

  final VoidCallback onProgramacao;
  final VoidCallback onDistribuicao;
  final VoidCallback onLaudo;

  @override
  Widget build(BuildContext context) {
    return Positioned(
      left: 0,
      right: 0,
      bottom: 0,
      child: ClipRect(
        child: BackdropFilter(
          filter: ui.ImageFilter.blur(sigmaX: 18, sigmaY: 18),
          child: Container(
            height: 74,
            padding: const EdgeInsets.fromLTRB(10, 8, 10, 6),
            decoration: BoxDecoration(
              color:
                  (Theme.of(context).brightness == Brightness.light
                          ? Colors.white
                          : const Color(0xFF050A09))
                      .withValues(alpha: 0.92),
              border: const Border(top: BorderSide(color: Color(0x33245220))),
              boxShadow: [
                BoxShadow(
                  color: Colors.black.withValues(alpha: 0.5),
                  blurRadius: 24,
                  offset: const Offset(0, -10),
                ),
              ],
            ),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.spaceAround,
              children: [
                BottomNavItem(
                  icon: Icons.calendar_today,
                  label: 'Agenda',
                  active: true,
                  onTap: onProgramacao,
                ),
                BottomNavItem(
                  icon: Icons.account_tree_outlined,
                  label: 'Distr.',
                  onTap: onDistribuicao,
                ),
                Transform.translate(
                  offset: const Offset(0, -10),
                  child: GestureDetector(
                    onTap: onLaudo,
                    child: Container(
                      width: 56,
                      height: 56,
                      decoration: const BoxDecoration(
                        color: Color(0xFFF58220),
                        shape: BoxShape.circle,
                        boxShadow: [
                          BoxShadow(
                            color: Color(0x88F58220),
                            blurRadius: 18,
                            spreadRadius: 0,
                          ),
                        ],
                      ),
                      child: const Icon(
                        Icons.description_outlined,
                        color: Colors.white,
                        size: 28,
                      ),
                    ),
                  ),
                ),
                BottomNavItem(
                  icon: Icons.analytics_outlined,
                  label: 'Stats',
                  onTap: () => showOk(context, 'Stats em desenvolvimento.'),
                ),
                BottomNavItem(
                  icon: Icons.contrast,
                  label: 'Tema',
                  onTap: () async {
                    await AppThemeController.instance.toggle();
                    if (context.mounted) {
                      showOk(
                        context,
                        AppThemeController.instance.isLight
                            ? 'Tema claro ativado.'
                            : 'Tema escuro ativado.',
                      );
                    }
                  },
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class BottomNavItem extends StatelessWidget {
  const BottomNavItem({
    super.key,
    required this.icon,
    required this.label,
    required this.onTap,
    this.active = false,
  });

  final IconData icon;
  final String label;
  final VoidCallback onTap;
  final bool active;

  @override
  Widget build(BuildContext context) {
    final isLight = Theme.of(context).brightness == Brightness.light;
    final color = active
        ? const Color(0xFFF58220)
        : (isLight ? const Color(0xFF173E37) : const Color(0xFF58706C));
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(12),
      child: SizedBox(
        width: 54,
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(icon, color: color, size: 23),
            const SizedBox(height: 4),
            Text(
              label,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: TextStyle(
                color: color,
                fontSize: 12,
                fontWeight: FontWeight.w800,
                letterSpacing: 1.2,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class CyberCardImage extends StatelessWidget {
  const CyberCardImage({super.key, required this.asset, required this.accent});

  final String asset;
  final Color accent;

  @override
  Widget build(BuildContext context) {
    final isLight = Theme.of(context).brightness == Brightness.light;
    return Stack(
      fit: StackFit.expand,
      children: [
        Image.asset(asset, fit: BoxFit.cover),
        DecoratedBox(
          decoration: BoxDecoration(
            gradient: LinearGradient(
              begin: Alignment.topLeft,
              end: Alignment.bottomRight,
              colors: isLight
                  ? [
                      Colors.white.withValues(alpha: 0.18),
                      const Color(0xFFEFF7EB).withValues(alpha: 0.12),
                      Colors.white.withValues(alpha: 0.24),
                    ]
                  : [
                      const Color(0xFF06100D).withValues(alpha: 0.74),
                      const Color(0xFF06100D).withValues(alpha: 0.60),
                      Colors.black.withValues(alpha: 0.76),
                    ],
            ),
          ),
        ),
        DecoratedBox(
          decoration: BoxDecoration(color: accent.withValues(alpha: 0.08)),
        ),
      ],
    );
  }
}

class CyberCorner extends StatelessWidget {
  const CyberCorner({super.key, this.accent = const Color(0xFFF58220)});

  final Color accent;

  @override
  Widget build(BuildContext context) {
    return CustomPaint(
      size: const Size(16, 16),
      painter: _CornerPainter(accent),
    );
  }
}

class _CornerPainter extends CustomPainter {
  const _CornerPainter(this.accent);
  final Color accent;

  @override
  void paint(Canvas canvas, Size size) {
    final paint = Paint()
      ..color = accent.withValues(alpha: 0.78)
      ..strokeWidth = 2;
    canvas.drawLine(Offset(size.width - 13, 1), Offset(size.width, 1), paint);
    canvas.drawLine(
      Offset(size.width - 1, 1),
      Offset(size.width - 1, 14),
      paint,
    );
  }

  @override
  bool shouldRepaint(covariant _CornerPainter oldDelegate) =>
      oldDelegate.accent != accent;
}

class CardTerrainPainter extends CustomPainter {
  const CardTerrainPainter({required this.accent, required this.variant});

  final Color accent;
  final int variant;

  @override
  void paint(Canvas canvas, Size size) {
    final rect = Offset.zero & size;
    canvas.drawRect(
      rect,
      Paint()
        ..shader =
            ui.Gradient.linear(Offset.zero, Offset(size.width, size.height), [
              accent.withValues(alpha: 0.13),
              const Color(0x00000000),
              const Color(0x33000000),
            ]),
    );

    final horizon = Paint()
      ..color = const Color(0x442B3B25)
      ..style = PaintingStyle.fill;
    final path = Path()..moveTo(0, size.height * 0.40);
    for (var i = 0; i <= 8; i++) {
      final x = size.width * i / 8;
      final y =
          size.height *
          (variant == 0
              ? (0.34 + (i.isEven ? 0.05 : -0.03))
              : (0.42 + (i.isEven ? -0.04 : 0.03)));
      path.lineTo(x, y);
    }
    path
      ..lineTo(size.width, size.height)
      ..lineTo(0, size.height)
      ..close();
    canvas.drawPath(path, horizon);

    final rowPaint = Paint()
      ..color = accent.withValues(alpha: 0.08)
      ..strokeWidth = 1;
    for (var i = 0; i < 9; i++) {
      final startX = size.width * (i / 9);
      canvas.drawLine(
        Offset(startX, size.height),
        Offset(size.width * 0.52, size.height * 0.46),
        rowPaint,
      );
    }
  }

  @override
  bool shouldRepaint(covariant CardTerrainPainter oldDelegate) =>
      oldDelegate.accent != accent || oldDelegate.variant != variant;
}

class NeonIconBox extends StatelessWidget {
  const NeonIconBox({
    super.key,
    required this.icon,
    required this.color,
    this.size = 64,
  });

  final IconData icon;
  final Color color;
  final double size;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: size,
      height: size,
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(4),
        border: Border.all(color: color.withValues(alpha: 0.52)),
        boxShadow: [
          BoxShadow(
            color: color.withValues(alpha: 0.16),
            blurRadius: 22,
            spreadRadius: 1,
          ),
        ],
      ),
      child: Icon(icon, color: color, size: size * 0.52),
    );
  }
}

BoxDecoration cyberCardDecoration(Color accent, {required bool isLight}) {
  return BoxDecoration(
    color: isLight
        ? Colors.white.withValues(alpha: 0.88)
        : const Color(0xCC0D1F1B),
    borderRadius: BorderRadius.circular(2),
    border: Border.all(color: accent.withValues(alpha: isLight ? 0.82 : 0.52)),
    boxShadow: [
      BoxShadow(
        color: Colors.black.withValues(alpha: isLight ? 0.18 : 0.72),
        blurRadius: 26,
        offset: const Offset(0, 14),
      ),
      BoxShadow(color: accent.withValues(alpha: 0.16), blurRadius: 18),
    ],
  );
}

class DistribuicaoOsPage extends StatefulWidget {
  const DistribuicaoOsPage({super.key});

  @override
  State<DistribuicaoOsPage> createState() => _DistribuicaoOsPageState();
}

class _DistribuicaoOsPageState extends State<DistribuicaoOsPage> {
  final api = ApiClient();
  var loading = true;
  var sending = false;
  var classificadores = <Classificador>[];
  var osAtivas = <OsAtiva>[];
  var jobs = <DistributionJob>[];
  Classificador? selectedClassificador;
  OsAtiva? selectedOs;

  @override
  void initState() {
    super.initState();
    jobs = DistributionQueue.instance.jobs.value;
    DistributionQueue.instance.jobs.addListener(syncJobs);
    loadCached();
    loadAll();
  }

  @override
  void dispose() {
    DistributionQueue.instance.jobs.removeListener(syncJobs);
    super.dispose();
  }

  void syncJobs() {
    if (mounted) setState(() => jobs = DistributionQueue.instance.jobs.value);
  }

  Future<void> loadCached() async {
    final cachedClassificadores = await LocalCache.list(
      LocalCache.classificadoresKey,
    );
    final cachedOs = await LocalCache.list(LocalCache.osAtivasKey);
    if (!mounted) return;
    setState(() {
      if (cachedClassificadores != null) {
        classificadores = cachedClassificadores
            .whereType<Map<String, dynamic>>()
            .map(Classificador.fromJson)
            .toList();
      }
      if (cachedOs != null) {
        osAtivas = cachedOs
            .whereType<Map<String, dynamic>>()
            .map(OsAtiva.fromJson)
            .where((o) => o.osId.isNotEmpty)
            .toList();
      }
      if (classificadores.isNotEmpty || osAtivas.isNotEmpty) loading = false;
    });
  }

  Future<void> loadAll() async {
    setState(() => loading = true);
    try {
      final results = await Future.wait([
        api.get('/api/classificadores?onlyActive=1'),
        api.get('/api/classific/os-ativas'),
      ]);
      final classificadoresJson = ((results[0]['items'] as List?) ?? [])
          .whereType<Map<String, dynamic>>()
          .toList();
      final osJson = ((results[1]['items'] as List?) ?? [])
          .whereType<Map<String, dynamic>>()
          .toList();
      classificadores = classificadoresJson
          .map(Classificador.fromJson)
          .toList();
      osAtivas = osJson
          .map(OsAtiva.fromJson)
          .where((o) => o.osId.isNotEmpty)
          .toList();
      await LocalCache.save(LocalCache.classificadoresKey, classificadoresJson);
      await LocalCache.save(LocalCache.osAtivasKey, osJson);
    } catch (e) {
      if (mounted) showError(context, '$e');
    } finally {
      if (mounted) setState(() => loading = false);
    }
  }

  Future<void> chooseOs() async {
    final os = await showModalBottomSheet<OsAtiva>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (context) => OsPickerSheet(items: osAtivas),
    );
    if (os != null) setState(() => selectedOs = os);
  }

  Future<void> submit() async {
    final os = selectedOs;
    final classificador = selectedClassificador;
    if (os == null || classificador == null) {
      showError(context, 'Selecione a O.S. e o classificador.');
      return;
    }
    setState(() => sending = true);
    try {
      await DistributionQueue.instance.enqueue(
        os: os,
        classificador: classificador,
      );
      if (mounted) {
        showOk(
          context,
          'Alteracao enviada. Pode sair da tela; aviso quando concluir.',
        );
      }
      setState(() {
        selectedOs = null;
        selectedClassificador = null;
      });
    } catch (e) {
      if (mounted) showError(context, '$e');
    } finally {
      if (mounted) setState(() => sending = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: SafeArea(
        child: RefreshIndicator(
          onRefresh: loadAll,
          child: ListView(
            padding: const EdgeInsets.fromLTRB(18, 18, 18, 34),
            children: [
              Row(
                children: [
                  IconButton.filledTonal(
                    onPressed: () => Navigator.pop(context),
                    icon: const Icon(Icons.arrow_back),
                  ),
                  const SizedBox(width: 10),
                  const Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          'Distribuição de O.S.',
                          style: TextStyle(
                            fontSize: 24,
                            fontWeight: FontWeight.w900,
                          ),
                        ),
                        Text(
                          'Troca de classificador no Classific',
                          style: TextStyle(color: Color(0xFFA3CFCB)),
                        ),
                      ],
                    ),
                  ),
                  IconButton.filledTonal(
                    onPressed: loading ? null : loadAll,
                    icon: const Icon(Icons.refresh),
                  ),
                ],
              ),
              const SizedBox(height: 18),
              if (loading) const LinearProgressIndicator(),
              const SizedBox(height: 12),
              AppCard(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    const Text(
                      'O.S. aberta',
                      style: TextStyle(
                        fontSize: 16,
                        fontWeight: FontWeight.w800,
                      ),
                    ),
                    const SizedBox(height: 10),
                    OutlinedButton(
                      onPressed: chooseOs,
                      style: OutlinedButton.styleFrom(
                        minimumSize: const Size.fromHeight(64),
                        alignment: Alignment.centerLeft,
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(18),
                        ),
                      ),
                      child: Row(
                        children: [
                          const Icon(Icons.assignment_outlined),
                          const SizedBox(width: 12),
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              mainAxisAlignment: MainAxisAlignment.center,
                              children: [
                                Text(
                                  selectedOs?.osId ?? 'Escolher O.S.',
                                  style: const TextStyle(
                                    fontSize: 16,
                                    fontWeight: FontWeight.w800,
                                  ),
                                ),
                                Text(
                                  selectedOs?.clientName ??
                                      'Buscar por OS, cliente ou local',
                                  maxLines: 1,
                                  overflow: TextOverflow.ellipsis,
                                  style: const TextStyle(
                                    color: Color(0xFFA3CFCB),
                                  ),
                                ),
                              ],
                            ),
                          ),
                          const Icon(Icons.chevron_right),
                        ],
                      ),
                    ),
                    if (selectedOs != null) ...[
                      const SizedBox(height: 12),
                      OsSummary(os: selectedOs!),
                    ],
                    const SizedBox(height: 14),
                    DropdownButtonFormField<Classificador>(
                      initialValue: selectedClassificador,
                      items: classificadores
                          .map(
                            (c) => DropdownMenuItem(
                              value: c,
                              child: Text(
                                c.nome,
                                overflow: TextOverflow.ellipsis,
                              ),
                            ),
                          )
                          .toList(),
                      onChanged: (value) =>
                          setState(() => selectedClassificador = value),
                      decoration: const InputDecoration(
                        labelText: 'Novo classificador',
                      ),
                    ),
                    const SizedBox(height: 14),
                    FilledButton.icon(
                      onPressed: sending ? null : submit,
                      icon: sending
                          ? const SizedBox(
                              width: 18,
                              height: 18,
                              child: CircularProgressIndicator(strokeWidth: 2),
                            )
                          : const Icon(Icons.sync_alt),
                      label: const Text('Alterar classificador'),
                      style: buttonStyle(),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 12),
              const Text(
                'A alteracao roda em segundo plano no app. Voce pode sair da tela apos enviar; o celular avisa quando concluir.',
                style: TextStyle(color: Color(0xFFA3CFCB)),
              ),
              if (jobs.isNotEmpty) ...[
                const SizedBox(height: 14),
                const Text(
                  'Processos recentes',
                  style: TextStyle(fontSize: 16, fontWeight: FontWeight.w800),
                ),
                const SizedBox(height: 8),
                ...jobs
                    .take(5)
                    .map(
                      (job) => Padding(
                        padding: const EdgeInsets.only(bottom: 8),
                        child: DistributionJobCard(job: job),
                      ),
                    ),
              ],
            ],
          ),
        ),
      ),
    );
  }
}

class DistributionJobCard extends StatelessWidget {
  const DistributionJobCard({super.key, required this.job});

  final DistributionJob job;

  @override
  Widget build(BuildContext context) {
    final color = switch (job.status) {
      'done' => const Color(0xFF7EF0C6),
      'error' => const Color(0xFFFFB4B4),
      _ => const Color(0xFFFFD27D),
    };
    final label = switch (job.status) {
      'done' => 'Concluido',
      'error' => 'Falhou',
      'running' => 'Em andamento',
      _ => 'Na fila',
    };
    return AppCard(
      child: Row(
        children: [
          Icon(
            job.status == 'done'
                ? Icons.check_circle
                : job.status == 'error'
                ? Icons.error_outline
                : Icons.sync,
            color: color,
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  job.osId,
                  style: const TextStyle(fontWeight: FontWeight.w900),
                ),
                Text(
                  '${job.classifierName} • $label',
                  style: TextStyle(color: color),
                ),
                if (job.error != null)
                  Text(
                    job.error!,
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(
                      color: Color(0xFFFFB4B4),
                      fontSize: 12,
                    ),
                  ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class ApiClient {
  static const _timeout = Duration(seconds: 180);

  Future<Map<String, dynamic>> get(String path) async {
    final res = await http
        .get(Uri.parse('$apiBaseUrl$path'), headers: await _headers())
        .timeout(_timeout);
    return _decode(res);
  }

  Future<Map<String, dynamic>> post(String path, Object body) async {
    final res = await http
        .post(
          Uri.parse('$apiBaseUrl$path'),
          headers: await _headers(),
          body: jsonEncode(body),
        )
        .timeout(_timeout);
    return _decode(res);
  }

  Future<Map<String, dynamic>> put(String path, Object body) async {
    final res = await http
        .put(
          Uri.parse('$apiBaseUrl$path'),
          headers: await _headers(),
          body: jsonEncode(body),
        )
        .timeout(_timeout);
    return _decode(res);
  }

  Future<List<int>> getBytes(String path) async {
    final res = await http
        .get(Uri.parse('$apiBaseUrl$path'), headers: await _headers())
        .timeout(_timeout);
    if (res.statusCode >= 400) {
      throw Exception('Falha ao baixar arquivo');
    }
    return res.bodyBytes;
  }

  Future<Map<String, String>> _headers() async {
    final token = Supabase.instance.client.auth.currentSession?.accessToken;
    return {
      'Content-Type': 'application/json',
      if (token != null) 'Authorization': 'Bearer $token',
    };
  }

  Map<String, dynamic> _decode(http.Response res) {
    final json = jsonDecode(utf8.decode(res.bodyBytes)) as Map<String, dynamic>;
    if (res.statusCode >= 400 || json['success'] != true) {
      throw Exception(json['error'] ?? 'Erro na API');
    }
    return json;
  }
}

class Classificador {
  Classificador({required this.id, required this.nome});
  final String id;
  final String nome;

  factory Classificador.fromJson(Map<String, dynamic> json) {
    return Classificador(id: '${json['id']}', nome: '${json['nome'] ?? ''}');
  }

  Map<String, dynamic> toJson() => {'id': id, 'nome': nome};
}

class OsAtiva {
  OsAtiva({
    required this.osId,
    this.detailId,
    this.clientName,
    this.embarkPoint,
    this.produto,
    this.loteKg,
    this.embarcadosKg,
    this.remanescenteKg,
    this.destino,
    this.status,
  });

  final String osId;
  final String? detailId;
  final String? clientName;
  final String? embarkPoint;
  final String? produto;
  final double? loteKg;
  final double? embarcadosKg;
  final double? remanescenteKg;
  final String? destino;
  final String? status;

  factory OsAtiva.fromJson(Map<String, dynamic> json) {
    return OsAtiva(
      osId: '${json['osId'] ?? ''}',
      detailId: json['detailId'] as String?,
      clientName: json['clientName'] as String?,
      embarkPoint: json['embarkPoint'] as String?,
      produto: json['produto'] as String?,
      loteKg: toDouble(json['loteKg']),
      embarcadosKg: toDouble(json['embarcadosKg']),
      remanescenteKg: toDouble(json['remanescenteKg']),
      destino: json['destino'] as String?,
      status: json['status'] as String?,
    );
  }

  Map<String, dynamic> toJson() => {
    'osId': osId,
    'detailId': detailId,
    'clientName': clientName,
    'embarkPoint': embarkPoint,
    'produto': produto,
    'loteKg': loteKg,
    'embarcadosKg': embarcadosKg,
    'remanescenteKg': remanescenteKg,
    'destino': destino,
    'status': status,
  };
}

class LaudoHistory {
  LaudoHistory({
    required this.id,
    this.laudoId,
    required this.osId,
    this.detailId,
    required this.data,
    required this.placa,
    required this.peso,
    required this.classificadorNome,
    this.cliente,
    this.embarque,
    this.destino,
    this.produto,
    this.transportadora,
    this.teste,
    this.insetosVivos,
    this.insetosMortos,
    this.odor,
    this.toxicidade,
    this.ardidosQueimados,
    this.umidade,
    this.queimados,
    this.impurezas,
    this.mofados,
    this.esverdeados,
    this.fermentados,
    this.quebrados,
    this.germinados,
    this.chochos,
    this.danificados,
    this.imaturos,
    this.observacoes,
    this.syncStatus = 'synced',
    this.syncError,
    required this.createdAt,
  });

  final String id;
  final String? laudoId;
  final String osId;
  final String? detailId;
  final String data;
  final String placa;
  final String peso;
  final String classificadorNome;
  final String? cliente;
  final String? embarque;
  final String? destino;
  final String? produto;
  final String? transportadora;
  final String? teste;
  final bool? insetosVivos;
  final bool? insetosMortos;
  final bool? odor;
  final bool? toxicidade;
  final String? ardidosQueimados;
  final String? umidade;
  final String? queimados;
  final String? impurezas;
  final String? mofados;
  final String? esverdeados;
  final String? fermentados;
  final String? quebrados;
  final String? germinados;
  final String? chochos;
  final String? danificados;
  final String? imaturos;
  final String? observacoes;
  final String syncStatus;
  final String? syncError;
  final DateTime createdAt;

  bool get syncing => syncStatus == 'pending' || syncStatus == 'running';
  bool get synced => syncStatus == 'synced';
  bool get failed => syncStatus == 'error';

  LaudoHistory copyWith({
    String? laudoId,
    String? syncStatus,
    String? syncError,
  }) => LaudoHistory(
    id: id,
    laudoId: laudoId ?? this.laudoId,
    osId: osId,
    detailId: detailId,
    data: data,
    placa: placa,
    peso: peso,
    classificadorNome: classificadorNome,
    cliente: cliente,
    embarque: embarque,
    destino: destino,
    produto: produto,
    transportadora: transportadora,
    teste: teste,
    insetosVivos: insetosVivos,
    insetosMortos: insetosMortos,
    odor: odor,
    toxicidade: toxicidade,
    ardidosQueimados: ardidosQueimados,
    umidade: umidade,
    queimados: queimados,
    impurezas: impurezas,
    mofados: mofados,
    esverdeados: esverdeados,
    fermentados: fermentados,
    quebrados: quebrados,
    germinados: germinados,
    chochos: chochos,
    danificados: danificados,
    imaturos: imaturos,
    observacoes: observacoes,
    syncStatus: syncStatus ?? this.syncStatus,
    syncError: syncError,
    createdAt: createdAt,
  );

  factory LaudoHistory.fromJson(Map<String, dynamic> json) => LaudoHistory(
    id: '${json['id']}',
    laudoId: json['laudoId'] as String?,
    osId: '${json['osId'] ?? ''}',
    detailId: json['detailId'] as String?,
    data: '${json['data'] ?? ''}',
    placa: '${json['placa'] ?? ''}',
    peso: '${json['peso'] ?? ''}',
    classificadorNome: '${json['classificadorNome'] ?? ''}',
    cliente: json['cliente'] as String?,
    embarque: json['embarque'] as String?,
    destino: json['destino'] as String?,
    produto: json['produto'] as String?,
    transportadora: json['transportadora'] as String?,
    teste: json['teste'] as String?,
    insetosVivos: json['insetosVivos'] as bool?,
    insetosMortos: json['insetosMortos'] as bool?,
    odor: json['odor'] as bool?,
    toxicidade: json['toxicidade'] as bool?,
    ardidosQueimados: json['ardidosQueimados'] as String?,
    umidade: json['umidade'] as String?,
    queimados: json['queimados'] as String?,
    impurezas: json['impurezas'] as String?,
    mofados: json['mofados'] as String?,
    esverdeados: json['esverdeados'] as String?,
    fermentados: json['fermentados'] as String?,
    quebrados: json['quebrados'] as String?,
    germinados: json['germinados'] as String?,
    chochos: json['chochos'] as String?,
    danificados: json['danificados'] as String?,
    imaturos: json['imaturos'] as String?,
    observacoes: json['observacoes'] as String?,
    syncStatus: '${json['syncStatus'] ?? 'synced'}',
    syncError: json['syncError'] as String?,
    createdAt:
        DateTime.tryParse('${json['createdAt'] ?? ''}') ?? DateTime.now(),
  );

  Map<String, dynamic> toPayload() => {
    'osId': osId,
    'detailId': detailId,
    'classifierName': classificadorNome,
    'data': data,
    'placa': placa,
    'peso': peso,
    'transportadora': transportadora,
    'teste': teste,
    'insetosVivos': insetosVivos,
    'insetosMortos': insetosMortos,
    'odor': odor,
    'toxicidade': toxicidade,
    'ardidosQueimados': ardidosQueimados,
    'umidade': umidade,
    'queimados': queimados,
    'impurezas': impurezas,
    'mofados': mofados,
    'esverdeados': esverdeados,
    'fermentados': fermentados,
    'quebrados': quebrados,
    'germinados': germinados,
    'chochos': chochos,
    'danificados': danificados,
    'imaturos': imaturos,
    'observacoes': observacoes,
  };

  Map<String, dynamic> toJson() => {
    'id': id,
    'laudoId': laudoId,
    'osId': osId,
    'detailId': detailId,
    'data': data,
    'placa': placa,
    'peso': peso,
    'classificadorNome': classificadorNome,
    'cliente': cliente,
    'embarque': embarque,
    'destino': destino,
    'produto': produto,
    'transportadora': transportadora,
    'teste': teste,
    'insetosVivos': insetosVivos,
    'insetosMortos': insetosMortos,
    'odor': odor,
    'toxicidade': toxicidade,
    'ardidosQueimados': ardidosQueimados,
    'umidade': umidade,
    'queimados': queimados,
    'impurezas': impurezas,
    'mofados': mofados,
    'esverdeados': esverdeados,
    'fermentados': fermentados,
    'quebrados': quebrados,
    'germinados': germinados,
    'chochos': chochos,
    'danificados': danificados,
    'imaturos': imaturos,
    'observacoes': observacoes,
    'syncStatus': syncStatus,
    'syncError': syncError,
    'createdAt': createdAt.toIso8601String(),
  };
}

class LaudoStore {
  LaudoStore._();
  static final instance = LaudoStore._();

  Future<List<LaudoHistory>> load() async {
    final list = await LocalCache.list(LocalCache.laudosHistoryKey);
    return ((list ?? [])
            .whereType<Map<String, dynamic>>()
            .map(LaudoHistory.fromJson)
            .where((item) => item.osId.isNotEmpty)
            .toList())
        .take(80)
        .toList();
  }

  Future<void> add(LaudoHistory item) async {
    final items = await load();
    final next = [
      item,
      ...items.where(
        (old) =>
            old.id != item.id &&
            (item.laudoId == null || old.laudoId != item.laudoId),
      ),
    ].take(80).toList();
    await saveAll(next);
  }

  Future<void> replace(LaudoHistory item) async {
    final items = await load();
    final found = items.any((old) => old.id == item.id);
    final next = found
        ? items.map((old) => old.id == item.id ? item : old).toList()
        : [item, ...items];
    await saveAll(next.take(80).toList());
  }

  Future<void> saveAll(List<LaudoHistory> items) async {
    await LocalCache.save(
      LocalCache.laudosHistoryKey,
      items.map((item) => item.toJson()).toList(),
    );
  }
}

class LaudoSyncQueue {
  LaudoSyncQueue._();
  static final instance = LaudoSyncQueue._();
  final items = ValueNotifier<List<LaudoHistory>>([]);
  final api = ApiClient();
  final _active = <String>{};

  Future<void> load() async {
    items.value = await LaudoStore.instance.load();
  }

  Future<void> loadAndResume() async {
    await load();
    for (final item in items.value.where((item) => item.syncing)) {
      _process(item.copyWith(syncStatus: 'pending', syncError: null));
    }
  }

  Future<void> enqueue(LaudoHistory item) async {
    await LaudoStore.instance.add(item);
    await load();
    _process(item);
  }

  Future<void> retry(LaudoHistory item) async {
    final next = item.copyWith(syncStatus: 'pending', syncError: null);
    await _replace(next);
    _process(next);
  }

  Future<void> _replace(LaudoHistory item) async {
    await LaudoStore.instance.replace(item);
    items.value = await LaudoStore.instance.load();
  }

  Future<void> _process(LaudoHistory item) async {
    if (_active.contains(item.id) || item.synced) return;
    _active.add(item.id);
    await _replace(item.copyWith(syncStatus: 'running', syncError: null));
    try {
      final result = await api.post('/api/classific/laudos', item.toPayload());
      final laudoId = result['laudoId'] == null ? null : '${result['laudoId']}';
      await _replace(
        item.copyWith(laudoId: laudoId, syncStatus: 'synced', syncError: null),
      );
      await NotificationService.instance.show(
        title: 'Laudo sincronizado',
        body: '${item.osId} foi salvo no Classific.',
      );
    } catch (e) {
      await _replace(item.copyWith(syncStatus: 'error', syncError: '$e'));
      await NotificationService.instance.show(
        title: 'Falha ao sincronizar laudo',
        body: '${item.osId}: $e',
      );
    } finally {
      _active.remove(item.id);
    }
  }
}

class ProgramacaoHistory {
  ProgramacaoHistory({
    required this.id,
    required this.data,
    this.importSourceDate,
    this.importReference,
  });

  final String id;
  final String data;
  final String? importSourceDate;
  final String? importReference;

  factory ProgramacaoHistory.fromJson(Map<String, dynamic> json) {
    return ProgramacaoHistory(
      id: '${json['id']}',
      data: '${json['data'] ?? ''}',
      importSourceDate: json['importSourceDate'] as String?,
      importReference: json['importReference'] as String?,
    );
  }

  Map<String, dynamic> toJson() => {
    'id': id,
    'data': data,
    'importSourceDate': importSourceDate,
    'importReference': importReference,
  };
}

class ProgramacaoItem {
  ProgramacaoItem({
    required this.id,
    required this.classificadorId,
    required this.classificadorNome,
    required this.osId,
    required this.localEmbarque,
    this.cliente,
    this.destino,
    this.fazendaArmazem,
    this.volumeRemanescente,
    this.volumeEmbarcado,
    this.volumeOs,
    this.produto,
  });

  final String id;
  final String? classificadorId;
  final String classificadorNome;
  final String osId;
  final String localEmbarque;
  final String? cliente;
  final String? destino;
  final String? fazendaArmazem;
  final double? volumeRemanescente;
  final double? volumeEmbarcado;
  final double? volumeOs;
  final String? produto;

  factory ProgramacaoItem.fromJson(Map<String, dynamic> json) {
    return ProgramacaoItem(
      id: '${json['id']}',
      classificadorId: json['classificadorId'] as String?,
      classificadorNome: '${json['classificadorNome'] ?? ''}',
      osId: '${json['osId'] ?? ''}',
      localEmbarque: '${json['localEmbarque'] ?? ''}',
      cliente: json['cliente'] as String?,
      destino: json['destino'] as String?,
      fazendaArmazem: json['fazendaArmazem'] as String?,
      volumeRemanescente: toDouble(json['volumeRemanescente']),
      volumeEmbarcado: toDouble(json['volumeEmbarcado']),
      volumeOs: toDouble(json['volumeOs']),
      produto: json['produto'] as String?,
    );
  }

  Map<String, dynamic> toJson() => {
    'id': id,
    'classificadorId': classificadorId,
    'classificadorNome': classificadorNome,
    'cliente': cliente,
    'localEmbarque': localEmbarque,
    'osId': osId,
    'destino': destino,
    'fazendaArmazem': fazendaArmazem,
    'volumeRemanescente': volumeRemanescente,
    'volumeEmbarcado': volumeEmbarcado,
    'volumeOs': volumeOs,
    'produto': produto,
  };
}

double? toDouble(Object? value) {
  if (value == null) return null;
  if (value is num) return value.toDouble();
  return double.tryParse('$value'.replaceAll(',', '.'));
}

double? effectiveRemanescente({
  required double? loteKg,
  required double? embarcadosKg,
  required double? remanescenteKg,
}) {
  final lote = loteKg ?? 0;
  final embarcados = embarcadosKg ?? 0;
  final remanescente = remanescenteKg ?? 0;
  if (lote > 0 && embarcados <= 0 && remanescente <= 0) return lote;
  return remanescenteKg;
}

class FazerLaudoPage extends StatefulWidget {
  const FazerLaudoPage({super.key});

  @override
  State<FazerLaudoPage> createState() => _FazerLaudoPageState();
}

class LaudosPage extends StatefulWidget {
  const LaudosPage({super.key});

  @override
  State<LaudosPage> createState() => _LaudosPageState();
}

class _LaudosPageState extends State<LaudosPage> {
  var items = <LaudoHistory>[];
  var loading = true;

  @override
  void initState() {
    super.initState();
    items = LaudoSyncQueue.instance.items.value;
    LaudoSyncQueue.instance.items.addListener(syncItems);
    load();
  }

  @override
  void dispose() {
    LaudoSyncQueue.instance.items.removeListener(syncItems);
    super.dispose();
  }

  void syncItems() {
    if (mounted) setState(() => items = LaudoSyncQueue.instance.items.value);
  }

  Future<void> load() async {
    await LaudoSyncQueue.instance.loadAndResume();
    final next = LaudoSyncQueue.instance.items.value;
    if (!mounted) return;
    setState(() {
      items = next;
      loading = false;
    });
  }

  Future<void> openNew() async {
    final created = await Navigator.of(context).push<LaudoHistory>(
      MaterialPageRoute(builder: (_) => const FazerLaudoPage()),
    );
    if (created != null) await load();
  }

  Future<void> openDetail(LaudoHistory item) async {
    await Navigator.of(
      context,
    ).push(MaterialPageRoute(builder: (_) => LaudoDetailPage(itemId: item.id)));
    await load();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: SafeArea(
        child: RefreshIndicator(
          onRefresh: load,
          child: ListView(
            padding: const EdgeInsets.fromLTRB(18, 18, 18, 34),
            children: [
              Row(
                children: [
                  IconButton.filledTonal(
                    onPressed: () => Navigator.pop(context),
                    icon: const Icon(Icons.arrow_back),
                  ),
                  const SizedBox(width: 10),
                  const Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          'Laudos',
                          style: TextStyle(
                            fontSize: 24,
                            fontWeight: FontWeight.w900,
                          ),
                        ),
                        Text(
                          'Histórico salvo neste aparelho',
                          style: TextStyle(color: Color(0xFFA3CFCB)),
                        ),
                      ],
                    ),
                  ),
                  IconButton.filledTonal(
                    onPressed: load,
                    icon: const Icon(Icons.refresh),
                  ),
                ],
              ),
              const SizedBox(height: 14),
              FilledButton.icon(
                onPressed: openNew,
                icon: const Icon(Icons.add),
                label: const Text('Novo laudo'),
                style: buttonStyle(),
              ),
              const SizedBox(height: 16),
              if (loading) const LinearProgressIndicator(),
              if (!loading && items.isEmpty)
                const AppCard(
                  child: Text(
                    'Nenhum laudo salvo neste aparelho ainda.',
                    style: TextStyle(color: Color(0xFFA3CFCB)),
                  ),
                ),
              for (final item in items) ...[
                LaudoHistoryCard(item: item, onTap: () => openDetail(item)),
                const SizedBox(height: 10),
              ],
            ],
          ),
        ),
      ),
    );
  }
}

class LaudoHistoryCard extends StatelessWidget {
  const LaudoHistoryCard({super.key, required this.item, required this.onTap});

  final LaudoHistory item;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final statusColor = switch (item.syncStatus) {
      'synced' => const Color(0xFF7EF0C6),
      'error' => const Color(0xFFFFB4B4),
      _ => const Color(0xFFFFD27D),
    };
    final statusLabel = switch (item.syncStatus) {
      'synced' => 'Sincronizado',
      'error' => 'Erro',
      'running' => 'Sincronizando',
      _ => 'Na fila',
    };
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(20),
      child: AppCard(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Row(
              children: [
                Container(
                  width: 48,
                  height: 48,
                  decoration: BoxDecoration(
                    color: const Color(0xFF173F35),
                    borderRadius: BorderRadius.circular(16),
                  ),
                  child: Icon(
                    item.synced
                        ? Icons.check_circle_outline
                        : item.failed
                        ? Icons.error_outline
                        : Icons.sync,
                    color: statusColor,
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        children: [
                          Expanded(
                            child: Text(
                              item.laudoId == null
                                  ? item.osId
                                  : 'Laudo ${item.laudoId}',
                              style: const TextStyle(
                                fontSize: 17,
                                fontWeight: FontWeight.w900,
                              ),
                            ),
                          ),
                          Text(
                            item.data,
                            style: const TextStyle(color: Color(0xFFA3CFCB)),
                          ),
                        ],
                      ),
                      const SizedBox(height: 3),
                      Text(
                        '${item.osId} • ${item.placa}',
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(fontWeight: FontWeight.w700),
                      ),
                      Text(
                        item.cliente ?? item.classificadorNome,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(color: Color(0xFFA3CFCB)),
                      ),
                    ],
                  ),
                ),
                const Icon(Icons.chevron_right),
              ],
            ),
            const SizedBox(height: 10),
            Row(
              children: [
                Chip(
                  label: Text(statusLabel),
                  labelStyle: TextStyle(color: statusColor),
                  visualDensity: VisualDensity.compact,
                  backgroundColor: statusColor.withValues(alpha: 0.12),
                  side: BorderSide(color: statusColor.withValues(alpha: 0.35)),
                ),
                if (item.failed) ...[
                  const Spacer(),
                  TextButton.icon(
                    onPressed: () => LaudoSyncQueue.instance.retry(item),
                    icon: const Icon(Icons.refresh),
                    label: const Text('Tentar de novo'),
                  ),
                ],
              ],
            ),
            if (item.syncError != null) ...[
              const SizedBox(height: 4),
              Text(
                item.syncError!,
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
                style: const TextStyle(color: Color(0xFFFFB4B4), fontSize: 12),
              ),
            ],
          ],
        ),
      ),
    );
  }
}

class LaudoDetailPage extends StatefulWidget {
  const LaudoDetailPage({super.key, required this.itemId});

  final String itemId;

  @override
  State<LaudoDetailPage> createState() => _LaudoDetailPageState();
}

class _LaudoDetailPageState extends State<LaudoDetailPage> {
  final api = ApiClient();
  final imageKey = GlobalKey();
  String? sharing;

  LaudoHistory? get item {
    for (final entry in LaudoSyncQueue.instance.items.value) {
      if (entry.id == widget.itemId) return entry;
    }
    return null;
  }

  @override
  void initState() {
    super.initState();
    LaudoSyncQueue.instance.items.addListener(syncItem);
  }

  @override
  void dispose() {
    LaudoSyncQueue.instance.items.removeListener(syncItem);
    super.dispose();
  }

  void syncItem() {
    if (mounted) setState(() {});
  }

  Future<void> sharePdf() async {
    final item = this.item;
    if (item == null) return;
    if (item.laudoId == null || item.laudoId!.isEmpty) {
      showError(
        context,
        'Número do laudo não localizado. Sincronize e tente novamente.',
      );
      return;
    }
    setState(() => sharing = 'pdf');
    try {
      final params = Uri(
        queryParameters: {'plate': item.placa, 'osId': item.osId},
      ).query;
      final bytes = await api.getBytes(
        '/api/plate-occurrences/laudos/${item.laudoId}/pdf?$params',
      );
      final dir = await getTemporaryDirectory();
      final file = File('${dir.path}/Laudo_${item.laudoId}.pdf');
      await file.writeAsBytes(bytes, flush: true);
      await SharePlus.instance.share(
        ShareParams(
          files: [XFile(file.path, mimeType: 'application/pdf')],
          text: 'Laudo ${item.laudoId} • ${item.osId}',
        ),
      );
    } catch (e) {
      if (mounted) showError(context, '$e');
    } finally {
      if (mounted) setState(() => sharing = null);
    }
  }

  Future<void> shareImage() async {
    setState(() => sharing = 'image');
    try {
      final boundary =
          imageKey.currentContext?.findRenderObject() as RenderRepaintBoundary?;
      if (boundary == null) throw Exception('Imagem do laudo não disponível.');
      final image = await boundary.toImage(pixelRatio: 2.5);
      final byteData = await image.toByteData(format: ui.ImageByteFormat.png);
      final bytes = byteData?.buffer.asUint8List();
      if (bytes == null) throw Exception('Falha ao gerar imagem do laudo.');
      final dir = await getTemporaryDirectory();
      final file = File(
        '${dir.path}/Laudo_${item?.laudoId ?? item?.osId ?? 'local'}.png',
      );
      await file.writeAsBytes(bytes, flush: true);
      await SharePlus.instance.share(
        ShareParams(
          files: [XFile(file.path, mimeType: 'image/png')],
          text: 'Laudo ${item?.laudoId ?? item?.osId ?? ''}',
        ),
      );
    } catch (e) {
      if (mounted) showError(context, '$e');
    } finally {
      if (mounted) setState(() => sharing = null);
    }
  }

  Widget line(String label, String? value) {
    final text = value?.trim();
    if (text == null || text.isEmpty) return const SizedBox.shrink();
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            label.toUpperCase(),
            style: const TextStyle(
              color: Color(0xFFA3CFCB),
              fontSize: 11,
              letterSpacing: 1.4,
            ),
          ),
          const SizedBox(height: 3),
          Text(
            text,
            style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w700),
          ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final item = this.item;
    if (item == null) {
      return Scaffold(
        body: SafeArea(
          child: Center(
            child: TextButton.icon(
              onPressed: () => Navigator.pop(context),
              icon: const Icon(Icons.arrow_back),
              label: const Text('Laudo não localizado'),
            ),
          ),
        ),
      );
    }
    final pdfReady = item.laudoId != null && item.laudoId!.isNotEmpty;
    return Scaffold(
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.fromLTRB(18, 18, 18, 34),
          children: [
            Row(
              children: [
                IconButton.filledTonal(
                  onPressed: () => Navigator.pop(context),
                  icon: const Icon(Icons.arrow_back),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        item.laudoId == null
                            ? 'Detalhe do Laudo'
                            : 'Laudo ${item.laudoId}',
                        style: const TextStyle(
                          fontSize: 24,
                          fontWeight: FontWeight.w900,
                        ),
                      ),
                      Text(
                        item.synced
                            ? 'Sincronizado com o Classific'
                            : item.failed
                            ? 'Falha na sincronização'
                            : 'Salvo no aparelho, sincronizando',
                        style: TextStyle(color: Color(0xFFA3CFCB)),
                      ),
                    ],
                  ),
                ),
              ],
            ),
            const SizedBox(height: 14),
            RepaintBoundary(
              key: imageKey,
              child: AppCard(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      item.osId,
                      style: const TextStyle(
                        fontSize: 22,
                        fontWeight: FontWeight.w900,
                      ),
                    ),
                    const SizedBox(height: 12),
                    line('Laudo', item.laudoId),
                    line('Data', item.data),
                    line('Cliente', item.cliente),
                    line('Embarque', item.embarque),
                    line('Destino', item.destino),
                    line('Produto', item.produto),
                    line('Placa', item.placa),
                    line('Peso kg', item.peso),
                    line('Classificador', item.classificadorNome),
                    line('Teste', item.teste),
                    line('Transportadora', item.transportadora),
                    const Divider(height: 26),
                    Wrap(
                      spacing: 8,
                      runSpacing: 8,
                      children: [
                        _MetricChip(label: 'Umidade', value: item.umidade),
                        _MetricChip(
                          label: 'Ardidos',
                          value: item.ardidosQueimados,
                        ),
                        _MetricChip(label: 'Queimados', value: item.queimados),
                        _MetricChip(label: 'Impurezas', value: item.impurezas),
                        _MetricChip(label: 'Mofados', value: item.mofados),
                        _MetricChip(
                          label: 'Esverdeados',
                          value: item.esverdeados,
                        ),
                        _MetricChip(
                          label: 'Fermentados',
                          value: item.fermentados,
                        ),
                        _MetricChip(label: 'Quebrados', value: item.quebrados),
                        _MetricChip(
                          label: 'Germinados',
                          value: item.germinados,
                        ),
                        _MetricChip(label: 'Chochos', value: item.chochos),
                        _MetricChip(
                          label: 'Danificados',
                          value: item.danificados,
                        ),
                        _MetricChip(label: 'Imaturos', value: item.imaturos),
                      ],
                    ),
                    if ((item.observacoes ?? '').trim().isNotEmpty) ...[
                      const Divider(height: 26),
                      line('Observações', item.observacoes),
                    ],
                  ],
                ),
              ),
            ),
            const SizedBox(height: 14),
            Row(
              children: [
                Expanded(
                  child: FilledButton.icon(
                    onPressed: sharing == null && pdfReady ? sharePdf : null,
                    icon: sharing == 'pdf'
                        ? const SizedBox(
                            width: 18,
                            height: 18,
                            child: CircularProgressIndicator(strokeWidth: 2),
                          )
                        : const Icon(Icons.picture_as_pdf_outlined),
                    label: const Text('PDF'),
                    style: buttonStyle(),
                  ),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: FilledButton.tonalIcon(
                    onPressed: sharing == null ? shareImage : null,
                    icon: sharing == 'image'
                        ? const SizedBox(
                            width: 18,
                            height: 18,
                            child: CircularProgressIndicator(strokeWidth: 2),
                          )
                        : const Icon(Icons.image_outlined),
                    label: const Text('Imagem'),
                  ),
                ),
              ],
            ),
            if (!pdfReady) ...[
              const SizedBox(height: 8),
              const Text(
                'O PDF do Classific fica disponível após a sincronização. A imagem local já pode ser compartilhada.',
                style: TextStyle(color: Color(0xFFA3CFCB), fontSize: 12),
              ),
            ],
            if (item.failed) ...[
              const SizedBox(height: 12),
              OutlinedButton.icon(
                onPressed: () => LaudoSyncQueue.instance.retry(item),
                icon: const Icon(Icons.refresh),
                label: const Text('Tentar sincronizar novamente'),
              ),
            ],
          ],
        ),
      ),
    );
  }
}

class _MetricChip extends StatelessWidget {
  const _MetricChip({required this.label, this.value});
  final String label;
  final String? value;

  @override
  Widget build(BuildContext context) {
    final clean = value?.trim();
    return Chip(
      label: Text('$label: ${clean == null || clean.isEmpty ? '0' : clean}%'),
      visualDensity: VisualDensity.compact,
    );
  }
}

class _FazerLaudoPageState extends State<FazerLaudoPage> {
  final api = ApiClient();
  final dateFormat = DateFormat('yyyy-MM-dd');
  final placaController = TextEditingController();
  final pesoController = TextEditingController();
  final transportadoraController = TextEditingController();
  final ardidosQueimadosController = TextEditingController();
  final umidadeController = TextEditingController();
  final queimadosController = TextEditingController();
  final impurezasController = TextEditingController();
  final mofadosController = TextEditingController();
  final esverdeadosController = TextEditingController();
  final fermentadosController = TextEditingController();
  final quebradosController = TextEditingController();
  final germinadosController = TextEditingController();
  final chochosController = TextEditingController();
  final danificadosController = TextEditingController();
  final imaturosController = TextEditingController();
  final observacoesController = TextEditingController();

  var loading = true;
  var saving = false;
  var selectedDate = DateTime.now();
  var classificadores = <Classificador>[];
  var osAtivas = <OsAtiva>[];
  OsAtiva? selectedOs;
  Classificador? selectedClassificador;
  var teste = 'Convencional';
  var insetosVivos = false;
  var insetosMortos = false;
  var odor = false;
  var toxicidade = false;

  static const testes = [
    'Convencional',
    'Transgênica',
    'Declarado Intacta',
    'Intacta Positivo',
    'Intacta Negativo',
    'Armazém Participante',
    'Não Testado',
  ];

  String get selectedDateIso => dateFormat.format(selectedDate);

  @override
  void initState() {
    super.initState();
    loadCached();
    loadAll();
  }

  @override
  void dispose() {
    placaController.dispose();
    pesoController.dispose();
    transportadoraController.dispose();
    ardidosQueimadosController.dispose();
    umidadeController.dispose();
    queimadosController.dispose();
    impurezasController.dispose();
    mofadosController.dispose();
    esverdeadosController.dispose();
    fermentadosController.dispose();
    quebradosController.dispose();
    germinadosController.dispose();
    chochosController.dispose();
    danificadosController.dispose();
    imaturosController.dispose();
    observacoesController.dispose();
    super.dispose();
  }

  Future<void> loadCached() async {
    final cachedClassificadores = await LocalCache.list(
      LocalCache.classificadoresKey,
    );
    final cachedOs = await LocalCache.list(LocalCache.osAtivasKey);
    if (!mounted) return;
    setState(() {
      if (cachedClassificadores != null) {
        classificadores = cachedClassificadores
            .whereType<Map<String, dynamic>>()
            .map(Classificador.fromJson)
            .toList();
      }
      if (cachedOs != null) {
        osAtivas = cachedOs
            .whereType<Map<String, dynamic>>()
            .map(OsAtiva.fromJson)
            .where((o) => o.osId.isNotEmpty)
            .toList();
      }
      if (classificadores.isNotEmpty || osAtivas.isNotEmpty) loading = false;
    });
  }

  Future<void> loadAll() async {
    setState(() => loading = true);
    try {
      final results = await Future.wait([
        api.get('/api/classificadores?onlyActive=1'),
        api.get('/api/classific/os-ativas'),
      ]);
      final classificadoresJson = ((results[0]['items'] as List?) ?? [])
          .whereType<Map<String, dynamic>>()
          .toList();
      final osJson = ((results[1]['items'] as List?) ?? [])
          .whereType<Map<String, dynamic>>()
          .toList();
      classificadores = classificadoresJson
          .map(Classificador.fromJson)
          .toList();
      osAtivas = osJson
          .map(OsAtiva.fromJson)
          .where((o) => o.osId.isNotEmpty)
          .toList();
      await LocalCache.save(LocalCache.classificadoresKey, classificadoresJson);
      await LocalCache.save(LocalCache.osAtivasKey, osJson);
    } catch (e) {
      if (mounted) showError(context, '$e');
    } finally {
      if (mounted) setState(() => loading = false);
    }
  }

  Future<void> pickDate() async {
    final picked = await showDatePicker(
      context: context,
      initialDate: selectedDate,
      firstDate: DateTime(2024),
      lastDate: DateTime(2035),
    );
    if (picked != null) setState(() => selectedDate = picked);
  }

  Future<void> chooseOs() async {
    final os = await showModalBottomSheet<OsAtiva>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (context) => OsPickerSheet(items: osAtivas),
    );
    if (os != null) setState(() => selectedOs = os);
  }

  Future<void> submit() async {
    final os = selectedOs;
    final classificador = selectedClassificador;
    if (os == null || classificador == null) {
      showError(context, 'Selecione a O.S. e o classificador.');
      return;
    }
    if (placaController.text.trim().isEmpty ||
        pesoController.text.trim().isEmpty) {
      showError(context, 'Informe placa e peso.');
      return;
    }

    setState(() => saving = true);
    try {
      final item = LaudoHistory(
        id: const Uuid().v4(),
        osId: os.osId,
        detailId: os.detailId,
        data: selectedDateIso,
        placa: placaController.text.trim(),
        peso: pesoController.text.trim(),
        classificadorNome: classificador.nome,
        cliente: os.clientName,
        embarque: os.embarkPoint,
        destino: os.destino,
        produto: os.produto,
        transportadora: transportadoraController.text.trim(),
        teste: teste,
        insetosVivos: insetosVivos,
        insetosMortos: insetosMortos,
        odor: odor,
        toxicidade: toxicidade,
        ardidosQueimados: ardidosQueimadosController.text.trim(),
        umidade: umidadeController.text.trim(),
        queimados: queimadosController.text.trim(),
        impurezas: impurezasController.text.trim(),
        mofados: mofadosController.text.trim(),
        esverdeados: esverdeadosController.text.trim(),
        fermentados: fermentadosController.text.trim(),
        quebrados: quebradosController.text.trim(),
        germinados: germinadosController.text.trim(),
        chochos: chochosController.text.trim(),
        danificados: danificadosController.text.trim(),
        imaturos: imaturosController.text.trim(),
        observacoes: observacoesController.text.trim(),
        syncStatus: 'pending',
        createdAt: DateTime.now(),
      );
      await LaudoSyncQueue.instance.enqueue(item);
      if (!mounted) return;
      showOk(
        context,
        'Laudo salvo no aparelho. Sincronizando em segundo plano.',
      );
      Navigator.pop(context, item);
    } catch (e) {
      if (mounted) showError(context, '$e');
    } finally {
      if (mounted) setState(() => saving = false);
    }
  }

  void clearForm() {
    setState(() {
      selectedOs = null;
      selectedClassificador = null;
      teste = 'Convencional';
      insetosVivos = false;
      insetosMortos = false;
      odor = false;
      toxicidade = false;
    });
    for (final controller in [
      placaController,
      pesoController,
      transportadoraController,
      ardidosQueimadosController,
      umidadeController,
      queimadosController,
      impurezasController,
      mofadosController,
      esverdeadosController,
      fermentadosController,
      quebradosController,
      germinadosController,
      chochosController,
      danificadosController,
      imaturosController,
      observacoesController,
    ]) {
      controller.clear();
    }
  }

  Widget textField(
    String label,
    TextEditingController controller, {
    TextInputType keyboardType = TextInputType.text,
    int maxLines = 1,
  }) {
    return TextField(
      controller: controller,
      keyboardType: keyboardType,
      maxLines: maxLines,
      decoration: InputDecoration(labelText: label),
    );
  }

  Widget percentField(String label, TextEditingController controller) {
    return textField(
      label,
      controller,
      keyboardType: const TextInputType.numberWithOptions(decimal: true),
    );
  }

  Widget yesNoField(String label, bool value, ValueChanged<bool> onChanged) {
    return DropdownButtonFormField<bool>(
      initialValue: value,
      items: const [
        DropdownMenuItem(value: false, child: Text('Não')),
        DropdownMenuItem(value: true, child: Text('Sim')),
      ],
      onChanged: (next) => onChanged(next ?? false),
      decoration: InputDecoration(labelText: label),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: SafeArea(
        child: RefreshIndicator(
          onRefresh: loadAll,
          child: ListView(
            padding: const EdgeInsets.fromLTRB(18, 18, 18, 34),
            children: [
              Row(
                children: [
                  IconButton.filledTonal(
                    onPressed: () => Navigator.pop(context),
                    icon: const Icon(Icons.arrow_back),
                  ),
                  const SizedBox(width: 10),
                  const Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          'Fazer Laudo',
                          style: TextStyle(
                            fontSize: 24,
                            fontWeight: FontWeight.w900,
                          ),
                        ),
                        Text(
                          'Registro completo no Classific',
                          style: TextStyle(color: Color(0xFFA3CFCB)),
                        ),
                      ],
                    ),
                  ),
                  IconButton.filledTonal(
                    onPressed: loading ? null : loadAll,
                    icon: const Icon(Icons.refresh),
                  ),
                ],
              ),
              const SizedBox(height: 18),
              if (loading) const LinearProgressIndicator(),
              const SizedBox(height: 12),
              AppCard(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    const Text(
                      'Dados do laudo',
                      style: TextStyle(
                        fontSize: 18,
                        fontWeight: FontWeight.w900,
                      ),
                    ),
                    const SizedBox(height: 12),
                    OutlinedButton(
                      onPressed: chooseOs,
                      style: OutlinedButton.styleFrom(
                        minimumSize: const Size.fromHeight(62),
                        alignment: Alignment.centerLeft,
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(18),
                        ),
                      ),
                      child: Row(
                        children: [
                          const Icon(Icons.assignment_outlined),
                          const SizedBox(width: 12),
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              mainAxisAlignment: MainAxisAlignment.center,
                              children: [
                                Text(
                                  selectedOs?.osId ?? 'Escolher O.S.',
                                  style: const TextStyle(
                                    fontSize: 16,
                                    fontWeight: FontWeight.w800,
                                  ),
                                ),
                                Text(
                                  selectedOs?.clientName ??
                                      'Buscar por OS, cliente ou local',
                                  maxLines: 1,
                                  overflow: TextOverflow.ellipsis,
                                  style: const TextStyle(
                                    color: Color(0xFFA3CFCB),
                                  ),
                                ),
                              ],
                            ),
                          ),
                          const Icon(Icons.chevron_right),
                        ],
                      ),
                    ),
                    if (selectedOs != null) ...[
                      const SizedBox(height: 12),
                      OsSummary(os: selectedOs!),
                    ],
                    const SizedBox(height: 12),
                    DropdownButtonFormField<Classificador>(
                      initialValue: selectedClassificador,
                      items: classificadores
                          .map(
                            (c) => DropdownMenuItem(
                              value: c,
                              child: Text(
                                c.nome,
                                overflow: TextOverflow.ellipsis,
                              ),
                            ),
                          )
                          .toList(),
                      onChanged: (value) =>
                          setState(() => selectedClassificador = value),
                      decoration: const InputDecoration(
                        labelText: 'Classificador(a) relacionado(a)',
                      ),
                    ),
                    const SizedBox(height: 12),
                    FilledButton.tonalIcon(
                      onPressed: pickDate,
                      icon: const Icon(Icons.calendar_today),
                      label: Text(selectedDateIso),
                      style: buttonStyle(),
                    ),
                    const SizedBox(height: 12),
                    textField('Placa', placaController),
                    const SizedBox(height: 12),
                    textField(
                      'Peso (kg)',
                      pesoController,
                      keyboardType: const TextInputType.numberWithOptions(
                        decimal: true,
                      ),
                    ),
                    const SizedBox(height: 12),
                    textField('Transportadora', transportadoraController),
                  ],
                ),
              ),
              const SizedBox(height: 14),
              AppCard(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    const Text(
                      'Classificação e teste',
                      style: TextStyle(
                        fontSize: 18,
                        fontWeight: FontWeight.w900,
                      ),
                    ),
                    const SizedBox(height: 12),
                    DropdownButtonFormField<String>(
                      initialValue: teste,
                      items: testes
                          .map(
                            (item) => DropdownMenuItem(
                              value: item,
                              child: Text(item),
                            ),
                          )
                          .toList(),
                      onChanged: (value) =>
                          setState(() => teste = value ?? 'Convencional'),
                      decoration: const InputDecoration(labelText: 'Teste'),
                    ),
                    const SizedBox(height: 12),
                    Row(
                      children: [
                        Expanded(
                          child: yesNoField(
                            'Insetos vivos',
                            insetosVivos,
                            (value) => setState(() => insetosVivos = value),
                          ),
                        ),
                        const SizedBox(width: 10),
                        Expanded(
                          child: yesNoField(
                            'Insetos mortos',
                            insetosMortos,
                            (value) => setState(() => insetosMortos = value),
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 12),
                    Row(
                      children: [
                        Expanded(
                          child: yesNoField(
                            'Odor',
                            odor,
                            (value) => setState(() => odor = value),
                          ),
                        ),
                        const SizedBox(width: 10),
                        Expanded(
                          child: yesNoField(
                            'Toxicidade',
                            toxicidade,
                            (value) => setState(() => toxicidade = value),
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 12),
                    percentField(
                      'Ardidos e queimados (%)',
                      ardidosQueimadosController,
                    ),
                    const SizedBox(height: 12),
                    Row(
                      children: [
                        Expanded(
                          child: percentField('Umidade (%)', umidadeController),
                        ),
                        const SizedBox(width: 10),
                        Expanded(
                          child: percentField(
                            'Queimados (%)',
                            queimadosController,
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 12),
                    percentField(
                      'Mat. estranhas e impurezas (%)',
                      impurezasController,
                    ),
                    const SizedBox(height: 12),
                    Row(
                      children: [
                        Expanded(
                          child: percentField('Mofados (%)', mofadosController),
                        ),
                        const SizedBox(width: 10),
                        Expanded(
                          child: percentField(
                            'Esverdeados (%)',
                            esverdeadosController,
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 12),
                    Row(
                      children: [
                        Expanded(
                          child: percentField(
                            'Fermentados (%)',
                            fermentadosController,
                          ),
                        ),
                        const SizedBox(width: 10),
                        Expanded(
                          child: percentField(
                            'Partido/quebrado (%)',
                            quebradosController,
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 12),
                    Row(
                      children: [
                        Expanded(
                          child: percentField(
                            'Germinados (%)',
                            germinadosController,
                          ),
                        ),
                        const SizedBox(width: 10),
                        Expanded(
                          child: percentField('Chochos (%)', chochosController),
                        ),
                      ],
                    ),
                    const SizedBox(height: 12),
                    Row(
                      children: [
                        Expanded(
                          child: percentField(
                            'Danificados (%)',
                            danificadosController,
                          ),
                        ),
                        const SizedBox(width: 10),
                        Expanded(
                          child: percentField(
                            'Imaturos (%)',
                            imaturosController,
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 12),
                    textField(
                      'Observações',
                      observacoesController,
                      maxLines: 3,
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 16),
              FilledButton.icon(
                onPressed: saving ? null : submit,
                icon: saving
                    ? const SizedBox(
                        width: 18,
                        height: 18,
                        child: CircularProgressIndicator(strokeWidth: 2),
                      )
                    : const Icon(Icons.cloud_upload_outlined),
                label: const Text('Salvar laudo'),
                style: buttonStyle(),
              ),
              const SizedBox(height: 10),
              const Text(
                'Nota fiscal será adicionada em uma próxima etapa com envio de arquivo pelo celular.',
                style: TextStyle(color: Color(0xFFA3CFCB)),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class ProgramacaoPage extends StatefulWidget {
  const ProgramacaoPage({super.key});

  @override
  State<ProgramacaoPage> createState() => _ProgramacaoPageState();
}

class _ProgramacaoPageState extends State<ProgramacaoPage> {
  final api = ApiClient();
  final uuid = const Uuid();
  final dateFormat = DateFormat('yyyy-MM-dd');
  var selectedDate = DateTime.now().add(const Duration(days: 1));
  String? programacaoId;
  Classificador? selectedClassificador;
  OsAtiva? selectedOs;
  var classificadores = <Classificador>[];
  var osAtivas = <OsAtiva>[];
  var itens = <ProgramacaoItem>[];
  var history = <ProgramacaoHistory>[];
  var loading = true;
  var saving = false;
  var historyLoading = false;
  String? sharingKey;

  String get selectedDateIso => dateFormat.format(selectedDate);

  @override
  void initState() {
    super.initState();
    loadCached();
    loadAll();
  }

  Future<void> loadCached() async {
    final cachedClassificadores = await LocalCache.list(
      LocalCache.classificadoresKey,
    );
    final cachedOs = await LocalCache.list(LocalCache.osAtivasKey);
    final cachedHistory = await LocalCache.map(LocalCache.historyKey);
    final cachedProgramacao = await LocalCache.map(
      LocalCache.programacaoKey(selectedDateIso),
    );
    if (!mounted) return;
    setState(() {
      if (cachedClassificadores != null) {
        classificadores = cachedClassificadores
            .whereType<Map<String, dynamic>>()
            .map(Classificador.fromJson)
            .toList();
      }
      if (cachedOs != null) {
        osAtivas = cachedOs
            .whereType<Map<String, dynamic>>()
            .map(OsAtiva.fromJson)
            .where((o) => o.osId.isNotEmpty)
            .toList();
      }
      if (cachedHistory != null) setHistory(cachedHistory);
      if (cachedProgramacao != null) setProgramacao(cachedProgramacao);
      if (classificadores.isNotEmpty ||
          osAtivas.isNotEmpty ||
          itens.isNotEmpty ||
          history.isNotEmpty) {
        loading = false;
      }
    });
  }

  Future<void> loadAll() async {
    setState(() => loading = true);
    try {
      final results = await Future.wait([
        api.get('/api/classificadores?onlyActive=1'),
        api.get('/api/classific/os-ativas'),
        api.get('/api/programacoes/by-date?date=$selectedDateIso'),
        api.get('/api/programacoes?page=1&pageSize=12'),
      ]);
      final classificadoresJson = ((results[0]['items'] as List?) ?? [])
          .whereType<Map<String, dynamic>>()
          .toList();
      final osJson = ((results[1]['items'] as List?) ?? [])
          .whereType<Map<String, dynamic>>()
          .toList();
      final programacaoJson =
          results[2]['programacao'] as Map<String, dynamic>?;
      classificadores = classificadoresJson
          .map(Classificador.fromJson)
          .toList();
      osAtivas = osJson
          .map(OsAtiva.fromJson)
          .where((o) => o.osId.isNotEmpty)
          .toList();
      setProgramacao(programacaoJson);
      setHistory(results[3]);
      await LocalCache.save(LocalCache.classificadoresKey, classificadoresJson);
      await LocalCache.save(LocalCache.osAtivasKey, osJson);
      await LocalCache.save(
        LocalCache.programacaoKey(selectedDateIso),
        programacaoJson,
      );
      await LocalCache.save(LocalCache.historyKey, results[3]);
    } catch (e) {
      if (mounted) showError(context, '$e');
    } finally {
      if (mounted) setState(() => loading = false);
    }
  }

  void setHistory(Map<String, dynamic> json) {
    history = ((json['items'] as List?) ?? [])
        .whereType<Map<String, dynamic>>()
        .map(ProgramacaoHistory.fromJson)
        .where((p) => p.id.isNotEmpty && p.data.isNotEmpty)
        .toList();
  }

  Future<void> loadHistory() async {
    setState(() => historyLoading = true);
    try {
      final result = await api.get('/api/programacoes?page=1&pageSize=12');
      await LocalCache.save(LocalCache.historyKey, result);
      setState(() => setHistory(result));
    } catch (e) {
      if (mounted) showError(context, '$e');
    } finally {
      if (mounted) setState(() => historyLoading = false);
    }
  }

  Future<void> loadProgramacaoByDate() async {
    setState(() => loading = true);
    final cachedProgramacao = await LocalCache.map(
      LocalCache.programacaoKey(selectedDateIso),
    );
    if (mounted && cachedProgramacao != null) {
      setState(() {
        setProgramacao(cachedProgramacao);
        loading = false;
      });
    }
    try {
      final result = await api.get(
        '/api/programacoes/by-date?date=$selectedDateIso',
      );
      final programacaoJson = result['programacao'] as Map<String, dynamic>?;
      await LocalCache.save(
        LocalCache.programacaoKey(selectedDateIso),
        programacaoJson,
      );
      if (mounted) setState(() => setProgramacao(programacaoJson));
    } catch (e) {
      if (mounted) showError(context, '$e');
    } finally {
      if (mounted) setState(() => loading = false);
    }
  }

  void setProgramacao(Map<String, dynamic>? json) {
    programacaoId = json == null ? null : '${json['id']}';
    itens = ((json?['itens'] as List?) ?? [])
        .whereType<Map<String, dynamic>>()
        .map(ProgramacaoItem.fromJson)
        .toList();
  }

  Future<void> pickDate() async {
    final picked = await showDatePicker(
      context: context,
      initialDate: selectedDate,
      firstDate: DateTime(2024),
      lastDate: DateTime(2035),
    );
    if (picked == null) return;
    setState(() => selectedDate = picked);
    await loadProgramacaoByDate();
  }

  Future<void> chooseOs() async {
    final os = await showModalBottomSheet<OsAtiva>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (context) => OsPickerSheet(items: osAtivas),
    );
    if (os != null) setState(() => selectedOs = os);
  }

  void addItem() {
    final classificador = selectedClassificador;
    final os = selectedOs;
    if (classificador == null || os == null) {
      showError(context, 'Selecione classificador e O.S.');
      return;
    }

    setState(() {
      itens = [
        ...itens,
        ProgramacaoItem(
          id: uuid.v4(),
          classificadorId: classificador.id,
          classificadorNome: classificador.nome,
          osId: os.osId,
          cliente: os.clientName,
          localEmbarque: os.embarkPoint ?? '',
          destino: os.destino,
          fazendaArmazem: os.embarkPoint,
          volumeRemanescente: effectiveRemanescente(
            loteKg: os.loteKg,
            embarcadosKg: os.embarcadosKg,
            remanescenteKg: os.remanescenteKg,
          ),
          volumeEmbarcado: os.embarcadosKg,
          volumeOs: os.loteKg,
          produto: os.produto,
        ),
      ];
      selectedOs = null;
      selectedClassificador = null;
    });
  }

  Future<void> loadFromHistory(ProgramacaoHistory item) async {
    final parsed = DateTime.tryParse(item.data);
    if (parsed != null) selectedDate = parsed;
    await loadProgramacaoByDate();
  }

  Future<void> shareProgramacao(ProgramacaoHistory item, String type) async {
    final ext = type == 'pdf' ? 'pdf' : 'png';
    final mime = type == 'pdf' ? 'application/pdf' : 'image/png';
    final key = '${item.id}-$type';
    setState(() => sharingKey = key);
    try {
      final bytes = await api.getBytes(
        '/api/programacoes/${item.id}/export/$type',
      );
      final dir = await getTemporaryDirectory();
      final file = File('${dir.path}/Programação_${item.data}.$ext');
      await file.writeAsBytes(bytes, flush: true);
      await SharePlus.instance.share(
        ShareParams(
          files: [XFile(file.path, mimeType: mime)],
          text: 'Programação ${item.data}',
        ),
      );
    } catch (e) {
      if (mounted) showError(context, '$e');
    } finally {
      if (mounted) setState(() => sharingKey = null);
    }
  }

  Future<void> save() async {
    setState(() => saving = true);
    try {
      final payload = {
        'data': selectedDateIso,
        'itens': itens.map((i) => i.toJson()).toList(),
      };
      final result = programacaoId == null
          ? await api.post('/api/programacoes', payload)
          : await api.put('/api/programacoes/$programacaoId', payload);
      final programacaoJson = result['programacao'] as Map<String, dynamic>?;
      setProgramacao(programacaoJson);
      await LocalCache.save(
        LocalCache.programacaoKey(selectedDateIso),
        programacaoJson,
      );
      await loadHistory();
      if (mounted) showOk(context, 'Programação salva.');
    } catch (e) {
      if (mounted) showError(context, '$e');
    } finally {
      if (mounted) setState(() => saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: SafeArea(
        child: RefreshIndicator(
          onRefresh: loadAll,
          child: ListView(
            padding: const EdgeInsets.fromLTRB(18, 18, 18, 34),
            children: [
              Row(
                children: [
                  const Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          'Programação',
                          style: TextStyle(
                            fontSize: 28,
                            fontWeight: FontWeight.w800,
                          ),
                        ),
                        SizedBox(height: 4),
                        Text(
                          'Operacao mobile',
                          style: TextStyle(color: Color(0xFFA3CFCB)),
                        ),
                      ],
                    ),
                  ),
                  IconButton.filledTonal(
                    onPressed: () => Supabase.instance.client.auth.signOut(),
                    icon: const Icon(Icons.logout),
                  ),
                ],
              ),
              const SizedBox(height: 18),
              Row(
                children: [
                  Expanded(
                    child: FilledButton.tonalIcon(
                      onPressed: pickDate,
                      icon: const Icon(Icons.calendar_today),
                      label: Text(selectedDateIso),
                      style: buttonStyle(),
                    ),
                  ),
                  const SizedBox(width: 10),
                  IconButton.filledTonal(
                    onPressed: loading ? null : loadAll,
                    icon: const Icon(Icons.refresh),
                    style: IconButton.styleFrom(
                      minimumSize: const Size(54, 54),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 18),
              if (loading) const LinearProgressIndicator(),
              const SizedBox(height: 12),
              AppCard(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    const Text(
                      'Adicionar item',
                      style: TextStyle(
                        fontSize: 18,
                        fontWeight: FontWeight.w800,
                      ),
                    ),
                    const SizedBox(height: 14),
                    DropdownButtonFormField<Classificador>(
                      initialValue: selectedClassificador,
                      items: classificadores
                          .map(
                            (c) => DropdownMenuItem(
                              value: c,
                              child: Text(
                                c.nome,
                                overflow: TextOverflow.ellipsis,
                              ),
                            ),
                          )
                          .toList(),
                      onChanged: (value) =>
                          setState(() => selectedClassificador = value),
                      decoration: const InputDecoration(
                        labelText: 'Classificador',
                      ),
                    ),
                    const SizedBox(height: 12),
                    OutlinedButton(
                      onPressed: chooseOs,
                      style: OutlinedButton.styleFrom(
                        minimumSize: const Size.fromHeight(62),
                        alignment: Alignment.centerLeft,
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(18),
                        ),
                      ),
                      child: Row(
                        children: [
                          const Icon(Icons.assignment_outlined),
                          const SizedBox(width: 12),
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              mainAxisAlignment: MainAxisAlignment.center,
                              children: [
                                Text(
                                  selectedOs?.osId ?? 'Escolher O.S.',
                                  style: const TextStyle(
                                    fontSize: 16,
                                    fontWeight: FontWeight.w800,
                                  ),
                                ),
                                Text(
                                  selectedOs?.clientName ??
                                      'Toque para buscar por OS, cliente ou local',
                                  maxLines: 1,
                                  overflow: TextOverflow.ellipsis,
                                  style: const TextStyle(
                                    color: Color(0xFFA3CFCB),
                                  ),
                                ),
                              ],
                            ),
                          ),
                          const Icon(Icons.chevron_right),
                        ],
                      ),
                    ),
                    if (selectedOs != null) ...[
                      const SizedBox(height: 12),
                      OsSummary(os: selectedOs!),
                    ],
                    const SizedBox(height: 14),
                    FilledButton.icon(
                      onPressed: addItem,
                      icon: const Icon(Icons.add),
                      label: const Text('Adicionar na programação'),
                      style: buttonStyle(),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 16),
              Row(
                children: [
                  Expanded(
                    child: Text(
                      '${itens.length} item(ns)',
                      style: const TextStyle(
                        fontSize: 18,
                        fontWeight: FontWeight.w800,
                      ),
                    ),
                  ),
                  FilledButton.icon(
                    onPressed: saving ? null : save,
                    icon: saving
                        ? const SizedBox(
                            width: 18,
                            height: 18,
                            child: CircularProgressIndicator(strokeWidth: 2),
                          )
                        : const Icon(Icons.cloud_upload_outlined),
                    label: const Text('Salvar'),
                  ),
                ],
              ),
              const SizedBox(height: 10),
              if (itens.isEmpty)
                const AppCard(
                  child: Text(
                    'Nenhum item adicionado ainda.',
                    style: TextStyle(color: Color(0xFFA3CFCB)),
                  ),
                )
              else
                ...itens.map(
                  (item) => Padding(
                    padding: const EdgeInsets.only(bottom: 10),
                    child: ProgramacaoItemCard(
                      item: item,
                      onDelete: () => setState(
                        () => itens = itens
                            .where((i) => i.id != item.id)
                            .toList(),
                      ),
                    ),
                  ),
                ),

              const SizedBox(height: 18),
              Row(
                children: [
                  const Expanded(
                    child: Text(
                      'Programações anteriores',
                      style: TextStyle(
                        fontSize: 18,
                        fontWeight: FontWeight.w800,
                      ),
                    ),
                  ),
                  IconButton.filledTonal(
                    onPressed: historyLoading ? null : loadHistory,
                    icon: historyLoading
                        ? const SizedBox(
                            width: 18,
                            height: 18,
                            child: CircularProgressIndicator(strokeWidth: 2),
                          )
                        : const Icon(Icons.refresh),
                  ),
                ],
              ),
              const SizedBox(height: 10),
              if (history.isEmpty)
                const AppCard(
                  child: Text(
                    'Nenhuma programação salva encontrada.',
                    style: TextStyle(color: Color(0xFFA3CFCB)),
                  ),
                )
              else
                ...history.map(
                  (item) => Padding(
                    padding: const EdgeInsets.only(bottom: 10),
                    child: HistoryCard(
                      item: item,
                      selected: item.data == selectedDateIso,
                      sharingKey: sharingKey,
                      onOpen: () => loadFromHistory(item),
                      onSharePdf: () => shareProgramacao(item, 'pdf'),
                      onShareImage: () => shareProgramacao(item, 'png'),
                    ),
                  ),
                ),
            ],
          ),
        ),
      ),
    );
  }
}

ButtonStyle buttonStyle() {
  return FilledButton.styleFrom(
    minimumSize: const Size.fromHeight(54),
    foregroundColor: const Color(0xFF052019),
    backgroundColor: const Color(0xFF8EDCB8),
    disabledBackgroundColor: const Color(0x448EDCB8),
    disabledForegroundColor: const Color(0x88E0F2F1),
    textStyle: const TextStyle(fontWeight: FontWeight.w900, fontSize: 16),
    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
    elevation: 0,
  );
}

class AppCard extends StatelessWidget {
  const AppCard({super.key, required this.child, this.padding});
  final Widget child;
  final EdgeInsetsGeometry? padding;

  @override
  Widget build(BuildContext context) {
    final isLight = Theme.of(context).brightness == Brightness.light;
    return ClipRRect(
      borderRadius: BorderRadius.circular(18),
      child: BackdropFilter(
        filter: ui.ImageFilter.blur(sigmaX: 14, sigmaY: 14),
        child: Container(
          padding: padding ?? const EdgeInsets.all(16),
          decoration: BoxDecoration(
            color: isLight
                ? Colors.white.withValues(alpha: 0.78)
                : const Color(0xDD0A1412).withValues(alpha: 0.76),
            borderRadius: BorderRadius.circular(18),
            border: Border.all(
              color: isLight
                  ? const Color(0x66D96F11)
                  : const Color(0x44F58220),
            ),
            boxShadow: [
              BoxShadow(
                color: Colors.black.withValues(alpha: isLight ? 0.12 : 0.34),
                blurRadius: 24,
                offset: const Offset(0, 14),
              ),
              BoxShadow(
                color: const Color(
                  0xFFF58220,
                ).withValues(alpha: isLight ? 0.10 : 0.06),
                blurRadius: 16,
              ),
            ],
          ),
          child: child,
        ),
      ),
    );
  }
}

class OsSummary extends StatelessWidget {
  const OsSummary({super.key, required this.os});
  final OsAtiva os;

  @override
  Widget build(BuildContext context) {
    return AppCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            os.clientName ?? 'Cliente nao informado',
            style: const TextStyle(fontWeight: FontWeight.w800),
          ),
          const SizedBox(height: 6),
          Text(os.embarkPoint ?? 'Embarque nao informado'),
          if (os.destino != null) Text('Destino: ${os.destino}'),
          if (os.produto != null) Text('Produto: ${os.produto}'),
          Text('Lote: ${formatKg(os.loteKg)}'),
          Text(
            'Reman.: ${formatKg(effectiveRemanescente(loteKg: os.loteKg, embarcadosKg: os.embarcadosKg, remanescenteKg: os.remanescenteKg))}',
          ),
        ],
      ),
    );
  }
}

class HistoryCard extends StatelessWidget {
  const HistoryCard({
    super.key,
    required this.item,
    required this.selected,
    required this.sharingKey,
    required this.onOpen,
    required this.onSharePdf,
    required this.onShareImage,
  });

  final ProgramacaoHistory item;
  final bool selected;
  final String? sharingKey;
  final VoidCallback onOpen;
  final VoidCallback onSharePdf;
  final VoidCallback onShareImage;

  @override
  Widget build(BuildContext context) {
    final reference = item.importReference?.trim().isNotEmpty == true
        ? item.importReference!.trim()
        : item.importSourceDate?.trim().isNotEmpty == true
        ? 'Importada de ${item.importSourceDate}'
        : 'Manual';
    final sharingPdf = sharingKey == '${item.id}-pdf';
    final sharingPng = sharingKey == '${item.id}-png';

    return AppCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      item.data,
                      style: const TextStyle(
                        fontSize: 19,
                        fontWeight: FontWeight.w900,
                      ),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      reference,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(color: Color(0xFFA3CFCB)),
                    ),
                  ],
                ),
              ),
              if (selected)
                const Chip(
                  label: Text('Aberta'),
                  visualDensity: VisualDensity.compact,
                ),
            ],
          ),
          const SizedBox(height: 12),
          Row(
            children: [
              Expanded(
                child: FilledButton.tonalIcon(
                  onPressed: onOpen,
                  icon: const Icon(Icons.visibility_outlined),
                  label: const Text('Abrir'),
                ),
              ),
              const SizedBox(width: 8),
              IconButton.filledTonal(
                onPressed: sharingPdf ? null : onSharePdf,
                icon: sharingPdf
                    ? const SizedBox(
                        width: 18,
                        height: 18,
                        child: CircularProgressIndicator(strokeWidth: 2),
                      )
                    : const Icon(Icons.picture_as_pdf_outlined),
                tooltip: 'Compartilhar PDF',
              ),
              const SizedBox(width: 8),
              IconButton.filledTonal(
                onPressed: sharingPng ? null : onShareImage,
                icon: sharingPng
                    ? const SizedBox(
                        width: 18,
                        height: 18,
                        child: CircularProgressIndicator(strokeWidth: 2),
                      )
                    : const Icon(Icons.image_outlined),
                tooltip: 'Compartilhar imagem',
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class ProgramacaoItemCard extends StatelessWidget {
  const ProgramacaoItemCard({
    super.key,
    required this.item,
    required this.onDelete,
  });
  final ProgramacaoItem item;
  final VoidCallback onDelete;

  @override
  Widget build(BuildContext context) {
    return AppCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      item.osId,
                      style: const TextStyle(
                        fontSize: 20,
                        fontWeight: FontWeight.w900,
                      ),
                    ),
                    Text(
                      item.classificadorNome,
                      style: const TextStyle(color: Color(0xFFA3CFCB)),
                    ),
                  ],
                ),
              ),
              IconButton.filledTonal(
                onPressed: onDelete,
                icon: const Icon(Icons.delete_outline),
                color: const Color(0xFFFFB4B4),
              ),
            ],
          ),
          const SizedBox(height: 12),
          InfoBox(label: 'Cliente', value: item.cliente ?? '-'),
          InfoBox(label: 'Embarque', value: item.localEmbarque),
          InfoBox(label: 'Destino', value: item.destino ?? '-'),
          Row(
            children: [
              Expanded(
                child: InfoBox(label: 'Lote', value: formatKg(item.volumeOs)),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: InfoBox(
                  label: 'Reman.',
                  value: formatKg(item.volumeRemanescente),
                ),
              ),
            ],
          ),
          InfoBox(label: 'Produto', value: item.produto ?? '-'),
        ],
      ),
    );
  }
}

class InfoBox extends StatelessWidget {
  const InfoBox({super.key, required this.label, required this.value});
  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      margin: const EdgeInsets.only(bottom: 8),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: const Color(0xFF0C1420),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: const Color(0xFF263443)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            label.toUpperCase(),
            style: const TextStyle(
              color: Color(0xFF8A96A6),
              fontSize: 11,
              fontWeight: FontWeight.w800,
              letterSpacing: 1.8,
            ),
          ),
          const SizedBox(height: 6),
          Text(
            value,
            style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w700),
          ),
        ],
      ),
    );
  }
}

class OsPickerSheet extends StatefulWidget {
  const OsPickerSheet({super.key, required this.items});
  final List<OsAtiva> items;

  @override
  State<OsPickerSheet> createState() => _OsPickerSheetState();
}

class _OsPickerSheetState extends State<OsPickerSheet> {
  final searchController = TextEditingController();

  @override
  void dispose() {
    searchController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final query = searchController.text.trim().toLowerCase();
    final items = widget.items
        .where((os) {
          if (query.isEmpty) return true;
          return [
            os.osId,
            os.clientName,
            os.embarkPoint,
            os.destino,
            os.status,
          ].whereType<String>().join(' ').toLowerCase().contains(query);
        })
        .take(100)
        .toList();

    return DraggableScrollableSheet(
      initialChildSize: 0.92,
      minChildSize: 0.65,
      maxChildSize: 0.98,
      builder: (context, controller) {
        return Container(
          decoration: const BoxDecoration(
            color: Color(0xFF071019),
            borderRadius: BorderRadius.vertical(top: Radius.circular(28)),
          ),
          child: Column(
            children: [
              Padding(
                padding: const EdgeInsets.fromLTRB(16, 12, 16, 8),
                child: Row(
                  children: [
                    const Expanded(
                      child: Text(
                        'Selecionar O.S.',
                        style: TextStyle(
                          fontSize: 22,
                          fontWeight: FontWeight.w900,
                        ),
                      ),
                    ),
                    IconButton.filledTonal(
                      onPressed: () => Navigator.pop(context),
                      icon: const Icon(Icons.close),
                    ),
                  ],
                ),
              ),
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 16),
                child: TextField(
                  controller: searchController,
                  autofocus: true,
                  onChanged: (_) => setState(() {}),
                  decoration: const InputDecoration(
                    hintText: 'Buscar OS, cliente ou local',
                    prefixIcon: Icon(Icons.search),
                  ),
                ),
              ),
              const SizedBox(height: 10),
              Expanded(
                child: items.isEmpty
                    ? const Center(child: Text('Nenhuma O.S. encontrada.'))
                    : ListView.separated(
                        controller: controller,
                        padding: const EdgeInsets.fromLTRB(16, 0, 16, 20),
                        itemCount: items.length,
                        separatorBuilder: (context, index) =>
                            const SizedBox(height: 10),
                        itemBuilder: (context, index) {
                          final os = items[index];
                          return InkWell(
                            onTap: () => Navigator.pop(context, os),
                            borderRadius: BorderRadius.circular(18),
                            child: AppCard(
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Row(
                                    children: [
                                      Expanded(
                                        child: Text(
                                          os.osId,
                                          style: const TextStyle(
                                            fontSize: 18,
                                            fontWeight: FontWeight.w900,
                                          ),
                                        ),
                                      ),
                                      if (os.status != null)
                                        Chip(
                                          label: Text(os.status!),
                                          visualDensity: VisualDensity.compact,
                                        ),
                                    ],
                                  ),
                                  const SizedBox(height: 6),
                                  Text(
                                    os.clientName ?? '-',
                                    maxLines: 2,
                                    overflow: TextOverflow.ellipsis,
                                  ),
                                  Text(
                                    os.embarkPoint ?? '-',
                                    maxLines: 2,
                                    overflow: TextOverflow.ellipsis,
                                    style: const TextStyle(
                                      color: Color(0xFFA3CFCB),
                                    ),
                                  ),
                                ],
                              ),
                            ),
                          );
                        },
                      ),
              ),
            ],
          ),
        );
      },
    );
  }
}

String formatKg(double? value) {
  if (value == null) return '-';
  final formatted = NumberFormat.decimalPattern('pt_BR').format(value);
  return '$formatted kg';
}

void showError(BuildContext context, String message) {
  ScaffoldMessenger.of(context).showSnackBar(
    SnackBar(content: Text(message), backgroundColor: const Color(0xFF8B2E35)),
  );
}

void showOk(BuildContext context, String message) {
  ScaffoldMessenger.of(context).showSnackBar(
    SnackBar(content: Text(message), backgroundColor: const Color(0xFF147D57)),
  );
}
