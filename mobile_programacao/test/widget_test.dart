import 'package:flutter_test/flutter_test.dart';
import 'package:inspectcheck_programacao/main.dart';

void main() {
  test('configuracao base carregada', () {
    expect(apiBaseUrl, isNotEmpty);
    expect(supabaseUrl, isNotEmpty);
  });
}
