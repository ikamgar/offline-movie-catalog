/**
 * DiagnosticsModal Component
 *
 * Admin-only diagnostics page showing catalog health.
 */

import { store } from '../store.js';
import { html, raw } from '../utils/html.js';
import { trapFocus } from '../utils/dialog.js';

class DiagnosticsModal extends HTMLElement {
  constructor() {
    super();
    this._releaseFocus = null;
    this._report = null;
  }

  async show() {
    this.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
    if (!this._releaseFocus) {
      this._releaseFocus = trapFocus(this, { onClose: () => this.hide() });
    }
    this.innerHTML = this._renderLoading();
    this._bindClose();

    const report = await store.fetchDiagnostics();
    this._report = report;
    this._renderReport();
  }

  hide() {
    this.classList.add('hidden');
    document.body.style.overflow = '';
    this._report = null;
    if (this._releaseFocus) {
      this._releaseFocus();
      this._releaseFocus = null;
    }
  }

  _renderLoading() {
    return html`
      <div class="modal-backdrop" id="diagBackdrop">
        <div class="modal" style="max-width:800px" id="diagModal" role="dialog" aria-modal="true" aria-labelledby="diagTitle">
          <div class="modal-header">
            <h3 class="modal-title" id="diagTitle">وضعیت سیستم</h3>
            <button class="btn-icon modal-close" id="closeDiag" aria-label="بستن">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M18 6 6 18"/><path d="m6 6 12 12"/>
              </svg>
            </button>
          </div>
          <div class="modal-body" style="display:flex;align-items:center;justify-content:center;padding:40px;">
            <div class="loading-spinner"></div>
          </div>
        </div>
      </div>
    `;
  }

  _renderReport() {
    const r = this._report;
    if (!r) {
      this.innerHTML = html`
        <div class="modal-backdrop" id="diagBackdrop">
          <div class="modal" style="max-width:800px" id="diagModal" role="dialog" aria-modal="true" aria-labelledby="diagTitle">
            <div class="modal-header">
              <h3 class="modal-title" id="diagTitle">وضعیت سیستم</h3>
              <button class="btn-icon modal-close" id="closeDiag" aria-label="بستن">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M18 6 6 18"/><path d="m6 6 12 12"/>
              </svg>
              </button>
            </div>
            <div class="modal-body">
              <p style="color:var(--color-text-secondary)">بارگذاری diagnostics ممکن نیست. آیا سرور در حال اجراست؟</p>
            </div>
          </div>
        </div>
      `;
      this._bindClose();
      return;
    }

    const s = r.summary;
    const issues = r.issues;

    this.innerHTML = html`
      <div class="modal-backdrop" id="diagBackdrop">
        <div class="modal" style="max-width:800px;max-height:85vh;" id="diagModal" role="dialog" aria-modal="true" aria-labelledby="diagTitle">
          <div class="modal-header">
            <h3 class="modal-title" id="diagTitle">وضعیت سیستم</h3>
            <button class="btn-icon modal-close" id="closeDiag" aria-label="بستن">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M18 6 6 18"/><path d="m6 6 12 12"/>
              </svg>
            </button>
          </div>
          <div class="modal-body" style="overflow-y:auto;max-height:calc(85vh - 70px);">
            <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:12px;margin-bottom:24px;">
              <div class="diag-stat-card">
                <div class="diag-stat-number">${s.totalMovies}</div>
                <div class="diag-stat-label">فیلم</div>
              </div>
              <div class="diag-stat-card">
                <div class="diag-stat-number">${s.totalFiles}</div>
                <div class="diag-stat-label">فایل پوستر</div>
              </div>
              <div class="diag-stat-card">
                <div class="diag-stat-number">${s.totalGenres}</div>
                <div class="diag-stat-label">ژانر</div>
              </div>
              <div class="diag-stat-card">
                <div class="diag-stat-number ${s.totalIssues > 0 ? 'diag-warn' : 'diag-ok'}">${s.totalIssues}</div>
                <div class="diag-stat-label">مشکل</div>
              </div>
              <div class="diag-stat-card">
                <div class="diag-stat-number">${s.totalGames || 0}</div>
                <div class="diag-stat-label">بازی</div>
              </div>
            </div>

            ${raw(this._renderStorageWarnings(r.storage && r.storage.warnings))}

            ${raw(this._renderTypeBreakdown(s.typeCounts))}

            ${raw(this._renderIssueSection('شناسه‌های تکراری', issues.duplicateIds, 'warning',
              (item) => html`شناسه #${item.id} ${item.count} بار تکرار شده${item.paths ? ` — ${item.paths.join('، ')}` : ''}`))}

            ${raw(this._renderIssueSection('عنوان سریال تکراری', issues.duplicateSeriesTitles, 'warning',
              (item) => html`"${item.title}" ${item.count} بار تکرار شده`))}

            ${raw(this._renderIssueSection('تداخل اطلاعات', issues.conflictingMetadata, 'warning',
              (item) => {
                const entries = item.entries || [];
                const titles = entries.map(e => e.title || e.path || '').filter(Boolean);
                if (titles.length >= 2) {
                  return html`${item.key || item.id || ''} — عنوان‌های متفاوت: «${titles[0]}» و «${titles[1]}»`;
                }
                return html`${item.key || item.id || item.title || ''} — ${item.reason || ''}`;
              }))}

            ${raw(this._renderIssueSection('نام فایل نامعتبر', issues.invalidFilenames, 'error',
              (item) => html`${item.file} — ${item.reason}`))}

            ${raw(this._renderIssueSection('نوع ناشناخته', issues.unknownTypes, 'warning',
              (item) => html`#${item.id} — ${item.title}`))}

            ${raw(this._renderIssueSection('متادیتای یتیم', issues.orphanMetadata, 'warning',
              (item) => html`${item.key}`))}

            ${raw(this._renderIssueSection('پوسترهای گمشده', issues.missingPosters, 'error',
              (item) => html`#${item.id} — ${item.title}`))}

            ${raw(this._renderIssueSection('سال‌های گمشده', issues.missingYears, 'warning',
              (item) => html`#${item.id} — ${item.title} (سال: ${item.year})`))}

            ${raw(this._renderIssueSection('ژانرهای خالی', issues.emptyGenres, 'warning',
              (item) => html`#${item.id} — ${item.title}`))}

            ${raw(this._renderIssueSection('لینک‌های شکسته', issues.brokenLinks, 'error',
              (item) => html`#${item.id} — ${item.path}`))}

            ${(issues.duplicateIds.length === 0 && issues.duplicateSeriesTitles.length === 0 &&
              issues.missingPosters.length === 0 &&
              issues.missingYears.length === 0 && issues.brokenLinks.length === 0 &&
              issues.emptyGenres.length === 0 &&
              (issues.invalidFilenames || []).length === 0 &&
              (issues.unknownTypes || []).length === 0 &&
              (issues.orphanMetadata || []).length === 0 &&
              (issues.conflictingMetadata || []).length === 0) ?
              raw('<div style="text-align:center;padding:20px;color:var(--color-accent-success);font-weight:600;">همه بررسی‌ها رد شد — مشکلی یافت نشد</div>') : ''}
          </div>
        </div>
      </div>
    `;

    this._bindClose();
  }

  _renderTypeBreakdown(typeCounts) {
    if (!typeCounts || Object.keys(typeCounts).length === 0) return '';
    return html`
      <div style="margin-bottom:24px;">
        <h4 style="font-size:var(--font-size-sm);color:var(--color-text-secondary);text-transform:uppercase;letter-spacing:0.05em;margin-bottom:10px;">انواع رسانه</h4>
        <div style="display:flex;gap:12px;flex-wrap:wrap;">
          ${raw(Object.entries(typeCounts).map(([type, count]) => html`
            <div style="padding:6px 14px;background:var(--color-bg-tertiary);border-radius:var(--radius-md);font-size:var(--font-size-sm);">
              <span style="font-weight:600;">${count}</span> ${type}
            </div>
          `).join(''))}
        </div>
      </div>
    `;
  }

  _renderStorageWarnings(warnings) {
    if (!warnings || warnings.length === 0) return '';
    const labels = {
      'corrupt-quarantined': 'فایل خراب قرنطینه شد',
      'restored-from-backup': 'بازیابی از نسخه پشتیبان',
      'migrated-metadata': 'انتقال اطلاعات تکمیلی'
    };
    const color = 'var(--color-accent-warning)';
    return html`
      <div style="margin-bottom:20px;">
        <h4 style="font-size:var(--font-size-sm);color:var(--color-text-secondary);text-transform:uppercase;letter-spacing:0.05em;margin-bottom:8px;display:flex;align-items:center;gap:8px;">
          <span style="width:8px;height:8px;border-radius:50%;background:${color};flex-shrink:0;"></span>
          هشدارهای ذخیره‌سازی
          <span style="font-size:var(--font-size-xs);color:var(--color-text-tertiary);">(${warnings.length})</span>
        </h4>
        <div style="background:var(--color-bg-tertiary);border-radius:var(--radius-md);padding:10px 14px;max-height:150px;overflow-y:auto;">
          ${raw(warnings.slice(0, 50).map(w => html`
            <div style="font-size:var(--font-size-sm);color:var(--color-text-secondary);padding:3px 0;border-bottom:1px solid var(--color-border-primary);">
              ${labels[w.kind] || w.kind} — ${w.file}${w.detail ? ` (${w.detail})` : ''}
            </div>
          `).join(''))}
        </div>
      </div>
    `;
  }

  _renderIssueSection(title, items, severity, renderFn) {
    if (!items || items.length === 0) return '';
    const color = severity === 'error' ? 'var(--color-accent-danger)' : 'var(--color-accent-warning)';
    return html`
      <div style="margin-bottom:20px;">
        <h4 style="font-size:var(--font-size-sm);color:var(--color-text-secondary);text-transform:uppercase;letter-spacing:0.05em;margin-bottom:8px;display:flex;align-items:center;gap:8px;">
          <span style="width:8px;height:8px;border-radius:50%;background:${color};flex-shrink:0;"></span>
          ${title}
          <span style="font-size:var(--font-size-xs);color:var(--color-text-tertiary);">(${items.length})</span>
        </h4>
        <div style="background:var(--color-bg-tertiary);border-radius:var(--radius-md);padding:10px 14px;max-height:150px;overflow-y:auto;">
          ${raw(items.slice(0, 50).map(item => html`
            <div style="font-size:var(--font-size-sm);color:var(--color-text-secondary);padding:3px 0;border-bottom:1px solid var(--color-border-primary);">
              ${raw(renderFn(item))}
            </div>
          `).join(''))}
          ${items.length > 50 ? raw(html`<div style="font-size:var(--font-size-xs);color:var(--color-text-tertiary);padding:6px 0;">...و ${items.length - 50} مورد دیگر</div>`) : ''}
        </div>
      </div>
    `;
  }

  _bindClose() {
    const backdrop = this.querySelector('#diagBackdrop');
    const closeBtn = this.querySelector('#closeDiag');
    const modal = this.querySelector('#diagModal');
    if (backdrop) backdrop.addEventListener('click', (e) => { if (e.target === backdrop) this.hide(); });
    if (modal) modal.addEventListener('click', (e) => e.stopPropagation());
    if (closeBtn) closeBtn.addEventListener('click', () => this.hide());
  }
}

customElements.define('diagnostics-modal', DiagnosticsModal);
