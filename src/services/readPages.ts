export interface ReadPage<T> { rows: T[]; total: number; }

// Contagem do servidor e ordenacao estavel sao obrigatorias. Avancar pelo numero
// efetivo de linhas suporta inclusive um max_rows menor que o tamanho solicitado.
export async function readAllPages<T>(
  fetchPage: (from: number, to: number) => Promise<ReadPage<T>>,
  pageSize = 100,
  signal?: AbortSignal,
): Promise<T[]> {
  if (!Number.isInteger(pageSize) || pageSize < 1) throw new Error('Tamanho de página inválido.');
  const rows: T[] = [];
  let total: number | null = null;
  for (;;) {
    signal?.throwIfAborted();
    const page = await fetchPage(rows.length, rows.length + pageSize - 1);
    signal?.throwIfAborted();
    if (!Number.isInteger(page.total) || page.total < 0 || page.rows.length > pageSize) {
      throw new Error('Resposta de paginação inválida.');
    }
    if (total !== null && total !== page.total) throw new Error('O cadastro mudou durante a leitura. Atualize a lista.');
    total = page.total;
    if (!page.rows.length && rows.length < total) throw new Error('Leitura incompleta. Confira as permissões e atualize a lista.');
    rows.push(...page.rows);
    if (rows.length > total) throw new Error('Contagem de clientes inconsistente.');
    if (rows.length === total) return rows;
  }
}
