import { Router, type Request, type Response } from 'express'
import {
  buildProgramacaoPdf,
  buildProgramacaoPng,
  buildProgramacaoXlsx,
} from '../services/programacaoExport.js'
import {
  deleteProgramacao,
  getProgramacaoByDate,
  getProgramacaoById,
  importProgramacaoFromMovements,
  listProgramacoes,
  saveProgramacao,
} from '../repositories/programacoesRepo.js'
import { formatResponsavelNome, getRequestUser } from '../utils/requestUser.js'

const router = Router()

router.get('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const from = req.query.from ? String(req.query.from) : undefined
    const to = req.query.to ? String(req.query.to) : undefined
    const page = req.query.page ? Number(req.query.page) : undefined
    const pageSize = req.query.pageSize ? Number(req.query.pageSize) : undefined
    const result = await listProgramacoes({ from, to, page, pageSize })
    res.status(200).json({ success: true, ...result })
  } catch (e: unknown) {
    res.status(500).json({
      success: false,
      error: e instanceof Error ? e.message : 'Falha ao listar programações',
    })
  }
})

router.get('/by-date', async (req: Request, res: Response): Promise<void> => {
  try {
    const date = String(req.query.date ?? '')
    if (!date) {
      res.status(400).json({ success: false, error: 'Missing date' })
      return
    }
    const programacao = await getProgramacaoByDate(date)
    res.status(200).json({ success: true, programacao })
  } catch (e: unknown) {
    res.status(500).json({
      success: false,
      error: e instanceof Error ? e.message : 'Falha ao buscar programação',
    })
  }
})

router.post('/import-movements', async (req: Request, res: Response): Promise<void> => {
  try {
    const { sourceDate, targetDate } = (req.body ?? {}) as {
      sourceDate?: string
      targetDate?: string
    }
    const source = String(sourceDate ?? '').trim()
    const target = String(targetDate ?? '').trim()
    if (!source || !target) {
      res.status(400).json({
        success: false,
        error: 'Informe a data movimentada e a data da programação',
      })
      return
    }

    const user = await getRequestUser(req)
    const result = await importProgramacaoFromMovements({
      sourceDate: source,
      targetDate: target,
      responsavel: {
        userId: user?.id ?? null,
        nome: formatResponsavelNome(user),
      },
    })

    res.status(200).json({ success: true, ...result })
  } catch (e: unknown) {
    res.status(500).json({
      success: false,
      error: e instanceof Error ? e.message : 'Falha ao importar programação',
    })
  }
})

router.get('/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const id = String(req.params.id ?? '')
    if (!id) {
      res.status(400).json({ success: false, error: 'Missing id' })
      return
    }
    const programacao = await getProgramacaoById(id)
    if (!programacao) {
      res.status(404).json({ success: false, error: 'Not found' })
      return
    }
    res.status(200).json({ success: true, programacao })
  } catch (e: unknown) {
    res.status(500).json({
      success: false,
      error: e instanceof Error ? e.message : 'Falha ao buscar programação',
    })
  }
})

router.post('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const { data, itens } = (req.body ?? {}) as { data?: string; itens?: unknown[] }
    const date = String(data ?? '')
    if (!date) {
      res.status(400).json({ success: false, error: 'Data é obrigatória' })
      return
    }
    const safeItens = Array.isArray(itens) ? itens : []
    const user = await getRequestUser(req)
    const programacao = await saveProgramacao({
      data: date,
      itens: safeItens as any,
      responsavel: {
        userId: user?.id ?? null,
        nome: formatResponsavelNome(user),
      },
    })
    res.status(201).json({ success: true, programacao })
  } catch (e: unknown) {
    res.status(500).json({
      success: false,
      error: e instanceof Error ? e.message : 'Falha ao salvar programação',
    })
  }
})

router.put('/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const id = String(req.params.id ?? '')
    if (!id) {
      res.status(400).json({ success: false, error: 'Missing id' })
      return
    }
    const { data, itens } = (req.body ?? {}) as { data?: string; itens?: unknown[] }
    const date = String(data ?? '')
    if (!date) {
      res.status(400).json({ success: false, error: 'Data é obrigatória' })
      return
    }
    const safeItens = Array.isArray(itens) ? itens : []
    const user = await getRequestUser(req)
    const programacao = await saveProgramacao({
      id,
      data: date,
      itens: safeItens as any,
      responsavel: {
        userId: user?.id ?? null,
        nome: formatResponsavelNome(user),
      },
    })
    res.status(200).json({ success: true, programacao })
  } catch (e: unknown) {
    res.status(500).json({
      success: false,
      error: e instanceof Error ? e.message : 'Falha ao atualizar programação',
    })
  }
})

router.delete('/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const id = String(req.params.id ?? '')
    if (!id) {
      res.status(400).json({ success: false, error: 'Missing id' })
      return
    }
    await deleteProgramacao(id)
    res.status(200).json({ success: true })
  } catch (e: unknown) {
    res.status(500).json({
      success: false,
      error: e instanceof Error ? e.message : 'Falha ao deletar programação',
    })
  }
})

router.get('/:id/export/xlsx', async (req: Request, res: Response): Promise<void> => {
  try {
    const id = String(req.params.id ?? '')
    if (!id) {
      res.status(400).json({ success: false, error: 'Missing id' })
      return
    }
    const programacao = await getProgramacaoById(id)
    if (!programacao) {
      res.status(404).json({ success: false, error: 'Not found' })
      return
    }
    const buf = await buildProgramacaoXlsx(programacao)
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="programacao_${programacao.data}.xlsx"`,
    )
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    )
    res.status(200).send(buf)
  } catch (e: unknown) {
    res.status(500).json({
      success: false,
      error: e instanceof Error ? e.message : 'Falha ao exportar XLSX',
    })
  }
})

router.get('/:id/export/pdf', async (req: Request, res: Response): Promise<void> => {
  try {
    const id = String(req.params.id ?? '')
    if (!id) {
      res.status(400).json({ success: false, error: 'Missing id' })
      return
    }
    const programacao = await getProgramacaoById(id)
    if (!programacao) {
      res.status(404).json({ success: false, error: 'Not found' })
      return
    }
    const buf = await buildProgramacaoPdf(programacao)
    res.setHeader('Content-Disposition', `attachment; filename="programacao_${programacao.data}.pdf"`)
    res.setHeader('Content-Type', 'application/pdf')
    res.status(200).send(buf)
  } catch (e: unknown) {
    res.status(500).json({
      success: false,
      error: e instanceof Error ? e.message : 'Falha ao exportar PDF',
    })
  }
})

router.get('/:id/export/png', async (req: Request, res: Response): Promise<void> => {
  try {
    const id = String(req.params.id ?? '')
    if (!id) {
      res.status(400).json({ success: false, error: 'Missing id' })
      return
    }
    const programacao = await getProgramacaoById(id)
    if (!programacao) {
      res.status(404).json({ success: false, error: 'Not found' })
      return
    }
    const buf = await buildProgramacaoPng(programacao)
    res.setHeader('Content-Disposition', `attachment; filename="programacao_${programacao.data}.png"`)
    res.setHeader('Content-Type', 'image/png')
    res.status(200).send(buf)
  } catch (e: unknown) {
    res.status(500).json({
      success: false,
      error: e instanceof Error ? e.message : 'Falha ao exportar imagem',
    })
  }
})

export default router
