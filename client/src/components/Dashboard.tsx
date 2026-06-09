import type { JobStats } from '../types';

const CARDS: { key: keyof JobStats; label: string; color: string }[] = [
  { key: 'pending', label: 'Pending', color: 'bg-amber-500/20 text-amber-300 border-amber-500/40' },
  { key: 'processing', label: 'Processing', color: 'bg-blue-500/20 text-blue-300 border-blue-500/40' },
  { key: 'completed', label: 'Completed', color: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40' },
  { key: 'failed', label: 'Failed', color: 'bg-red-500/20 text-red-300 border-red-500/40' },
  { key: 'cancelled', label: 'Cancelled', color: 'bg-slate-500/20 text-slate-300 border-slate-500/40' },
  { key: 'dlq', label: 'DLQ', color: 'bg-purple-500/20 text-purple-300 border-purple-500/40' },
];

export function Dashboard({ stats }: { stats: JobStats }) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
      {CARDS.map(({ key, label, color }) => (
        <div key={key} className={`rounded-xl border p-4 ${color}`}>
          <p className="text-sm opacity-80">{label}</p>
          <p className="text-3xl font-bold mt-1">{stats[key] ?? 0}</p>
        </div>
      ))}
    </div>
  );
}
