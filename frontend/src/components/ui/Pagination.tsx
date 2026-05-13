export function Pagination({ page, totalPages, onPage }: { page: number; totalPages: number; onPage: (p: number) => void }) {
  if (totalPages <= 1) return null;
  return (
    <div className="flex items-center justify-center gap-2 mt-4">
      <button onClick={() => onPage(page - 1)} disabled={page <= 1} className="px-3 py-1 text-sm rounded border hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed">Prev</button>
      {Array.from({ length: totalPages }, (_, i) => i + 1).map(p => (
        <button key={p} onClick={() => onPage(p)} className={`px-3 py-1 text-sm rounded ${p === page ? 'bg-primary text-white' : 'border hover:bg-gray-100'}`}>{p}</button>
      ))}
      <button onClick={() => onPage(page + 1)} disabled={page >= totalPages} className="px-3 py-1 text-sm rounded border hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed">Next</button>
    </div>
  );
}
