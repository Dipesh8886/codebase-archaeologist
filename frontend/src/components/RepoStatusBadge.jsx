const STYLES = {
  pending: 'bg-gray-700 text-gray-300',
  estimating: 'bg-amber-900 text-amber-300',
  indexing: 'bg-amber-900 text-amber-300 animate-pulse',
  ready: 'bg-emerald-900 text-emerald-300',
  failed: 'bg-red-900 text-red-300',
};

const LABELS = {
  pending: 'Queued',
  estimating: 'Estimating',
  indexing: 'Indexing…',
  ready: 'Ready',
  failed: 'Failed',
};

export default function RepoStatusBadge({ status }) {
  return (
    <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${STYLES[status] || STYLES.pending}`}>
      {LABELS[status] || status}
    </span>
  );
}
