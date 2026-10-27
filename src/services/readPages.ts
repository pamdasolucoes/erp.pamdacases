export interface ReadPage<T> { rows: T[]; total: number; }

// Contagem do servidor e ordenacao estavel sao obrigatorias. Avancar pelo numero
// efetivo de linhas suporta inclusive um max_rows menor que o tamanho solicitado.
export async function readAllPages<T>(
  fetchPage: (from: number, to: number) => Promise<ReadPage<T>>,
  pageSize = 100,
  signal?: AbortSignal,
  concurrency = 1,
): Promise<T[]> {
  if (!Number.isInteger(pageSize) || pageSize < 1) throw new Error('Tamanho de página inválido.');
  if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 4) throw new Error('Concorrência inválida.');
  const rows: T[] = [];
  let total: number | null = null;
  let stride = pageSize;
  for (;;) {
    signal?.throwIfAborted();
    // Discover the server's effective max_rows before scheduling bounded batches.
    const count: number = total === null ? 1 : Math.min(concurrency, Math.ceil((total - rows.length) / stride));
    const pages: ReadPage<T>[] = await Promise.all(Array.from({ length: count }, (_, index) => {
      const from = rows.length + index * stride;
      return fetchPage(from, from + stride - 1);
    }));
    signal?.throwIfAborted();
    for (const page of pages) {
      if (!Number.isInteger(page.total) || page.total < 0 || page.rows.length > stride) {
        throw new Error('Resposta de paginação inválida.');
      }
      if (total !== null && total !== page.total) throw new Error('O cadastro mudou durante a leitura. Atualize a lista.');
      total = page.total;
      if (!page.rows.length && rows.length < total) throw new Error('Leitura incompleta. Confira as permissões e atualize a lista.');
      rows.push(...page.rows);
      if (rows.length > total) throw new Error('Contagem de clientes inconsistente.');
      if (rows.length === total) return rows;
      if (count > 1 && page.rows.length !== stride) throw new Error('Leitura incompleta. Atualize a lista.');
      stride = page.rows.length;
    }
  }
}
