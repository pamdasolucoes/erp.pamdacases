// Exportação utilitária para CSV no padrão brasileiro (delimitador ponto-e-vírgula e codificação UTF-8 com BOM)

export function exportToCsv(filename: string, headers: string[], rows: (string | number)[][]) {
  const sanitize = (val: string | number | null | undefined): string => {
    if (val === null || val === undefined) return '';
    const str = String(val).replace(/"/g, '""');
    return `"${str}"`;
  };

  const headerLine = headers.map(sanitize).join(';');
  const dataLines = rows.map((row) => row.map(sanitize).join(';'));
  const csvContent = '\uFEFF' + [headerLine, ...dataLines].join('\r\n');

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', `${filename}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
