import { formatAmount } from '@/core/format';
import type { ZeldHuntProgress } from '@/core/zeld/types';
import { t } from '@/i18n';

/** Keep the clock separate from the live announcement so assistive technology hears milestones. */
export function HuntProgress({ progress, onContinue }: { progress: ZeldHuntProgress; onContinue: () => void }) {
  const elapsed = Math.min(progress.seconds, Math.max(0, progress.elapsedMs / 1000));
  const remaining = Math.max(0, Math.ceil(progress.seconds - elapsed));
  const rate = progress.hashRate >= 1_000_000
    ? `${formatAmount({ value: progress.hashRate / 1_000_000, minimumFractionDigits: 2, maximumFractionDigits: 2 })} MH/s`
    : `${formatAmount({ value: progress.hashRate / 1_000, minimumFractionDigits: 1, maximumFractionDigits: 1 })} kH/s`;
  const found = progress.bestZeroCount !== undefined;
  return (
    <section className="w-full max-w-sm rounded-xl border border-gray-200 bg-white p-5 shadow-sm space-y-4" aria-label={t('zeld_hunt_title')}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-semibold text-gray-900">{t('zeld_hunt_searching_title')}</h2>
        <span className="text-xs tabular-nums text-gray-500">{t('zeld_hunt_remaining', [String(remaining)])}</span>
      </div>
      <p role="status" className={`text-sm ${found ? 'text-green-700' : 'text-gray-600'}`}>
        {found ? t('zeld_hunt_found_searching', [String(progress.bestZeroCount)]) : t('zeld_hunt_searching')}
      </p>
      <div>
        <progress className="block h-2 w-full overflow-hidden rounded-full appearance-none border-0 bg-gray-100 [&::-webkit-progress-bar]:bg-gray-100 [&::-webkit-progress-value]:bg-blue-600 [&::-moz-progress-bar]:bg-blue-600" aria-label={t('zeld_hunt_elapsed_label')} max={progress.seconds || 1} value={elapsed} />
        <div className="mt-2 flex justify-between text-xs text-gray-500 tabular-nums">
          <span>{t('zeld_hunt_elapsed', [String(Math.floor(elapsed)), String(progress.seconds)])}</span>
          <span>{rate}</span>
        </div>
      </div>
      <p className="text-xs text-gray-500">{found ? t('zeld_hunt_best_saved') : t('zeld_hunt_continue_help')}</p>
      <button type="button" onClick={onContinue}
        className="w-full rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 cursor-pointer">
        {found ? t('zeld_hunt_use_now') : t('zeld_hunt_continue_without')}
      </button>
    </section>
  );
}
