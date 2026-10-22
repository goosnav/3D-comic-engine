/** Preserve measured stage progress across the worker/exporter → GUI boundary. */
export function progressReporter(job, onChange = () => {}) {
  return (message, detail) => {
    if (message && typeof message === 'object') { detail = message; message = detail.message; }
    job.progress = String(message ?? detail?.message ?? 'Working');
    job.progressDetail = {
      phase: detail?.phase ?? 'preparing',
      progress: typeof detail?.progress === 'number' && Number.isFinite(detail.progress)
        ? Math.max(0, Math.min(1, detail.progress)) : null,
      message: job.progress,
    };
    job.updatedAt = Date.now();
    onChange();
  };
}
