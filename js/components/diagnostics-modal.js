/**
 * DiagnosticsModal Component
 *
 * Admin-only diagnostics page showing catalog health:
 * - Duplicate IDs
 * - Missing posters
 * - Invalid filenames
 * - Missing years
 * - Unknown media types
 * - Broken image links
 * - Genre/type distribution stats
 */

import { store } from '../store.js';

class DiagnosticsModal extends HTMLElement {
  constructor() {
    super();
    this._handleKeydown = this._handleKeydown.bind(this);
    this._report = null;
  }

  connectedCallback() {
    document.addEventListener('keydown', this._handleKeydown);
  }

  disconnectedCallback() {
    document.removeEventListener('keydown', this._handleKeydown);
  }

  async show() {
    this.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
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
  }

  _renderLoading() {
    return `
      <div class="modal-backdrop" id="diagBackdrop">
        <div class="modal" style="max-width:800px" onclick="event.stopPropagation()">
          <div class="modal-header">
            <h3 class="modal-title">وضعیت سیستم</h3>
            <button class="btn-icon" id="closeDiag">
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
      this.innerHTML = `
        <div class="modal-backdrop" id="diagBackdrop">
          <div class="modal" style="max-width:800px" onclick="event.stopPropagation()">
            <div class="modal-header">
              <h3 class="modal-title">وضعیت سیستم</h3>
              <button class="btn-icon" id="closeDiag">
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

    this.innerHTML = `
      <div class="modal-backdrop" id="diagBackdrop">
        <div class="modal" style="max-width:800px;max-height:85vh;" onclick="event.stopPropagation()">
          <div class="modal-header">
            <h3 class="modal-title">وضعیت سیستم</h3>
            <button class="btn-icon" id="closeDiag">
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
            </div>

            ${this._renderTypeBreakdown(s.typeCounts)}

            ${this._renderIssueSection('شناسه‌های تکراری', issues.duplicateIds, 'warning',
              (item) => `شناسه #${item.id} ${item.count} بار تکرار شده`)}

            ${this._renderIssueSection('عنوان سریال تکراری', issues.duplicateSeriesTitles, 'warning',
              (item) => `"${item.title}" ${item.count} بار تکرار شده`)}

            ${this._renderIssueSection('پوسترهای گمشده', issues.missingPosters, 'error',
              (item) => `#${item.id} — ${item.title}`)}

            ${this._renderIssueSection('سال‌های گمشده', issues.missingYears, 'warning',
              (item) => `#${item.id} — ${item.title} (سال: ${item.year})`)}

            ${this._renderIssueSection('ژانرهای خالی', issues.emptyGenres, 'warning',
              (item) => `#${item.id} — ${item.title}`)}

            ${this._renderIssueSection('لینک‌های شکسته', issues.brokenLinks, 'error',
              (item) => `#${item.id} — ${item.path}`)}

            ${issues.duplicateIds.length === 0 && issues.duplicateSeriesTitles.length === 0 &&
              issues.missingPosters.length === 0 &&
              issues.missingYears.length === 0 && issues.brokenLinks.length === 0 &&
              issues.emptyGenres.length === 0 ?
              '<div style="text-align:center;padding:20px;color:var(--color-accent-success);font-weight:600;">همه بررسی‌ها رد شد — مشکلی یافت نشد</div>' : ''}

          </div>
        </div>
      </div>
    `;

    this._bindClose();
  }

  _renderTypeBreakdown(typeCounts) {
    if (!typeCounts || Object.keys(typeCounts).length === 0) return '';
    return `
      <div style="margin-bottom:24px;">
        <h4 style="font-size:var(--font-size-sm);color:var(--color-text-secondary);text-transform:uppercase;letter-spacing:0.05em;margin-bottom:10px;">انواع رسانه</h4>
        <div style="display:flex;gap:12px;flex-wrap:wrap;">
          ${Object.entries(typeCounts).map(([type, count]) => `
            <div style="padding:6px 14px;background:var(--color-bg-tertiary);border-radius:var(--radius-md);font-size:var(--font-size-sm);">
              <span style="font-weight:600;">${count}</span> ${type}
            </div>
          `).join('')}
        </div>
      </div>
    `;
  }

  _renderIssueSection(title, items, severity, renderFn) {
    if (!items || items.length === 0) return '';
    return `
      <div style="margin-bottom:20px;">
        <h4 style="font-size:var(--font-size-sm);color:var(--color-text-secondary);text-transform:uppercase;letter-spacing:0.05em;margin-bottom:8px;display:flex;align-items:center;gap:8px;">
          <span style="width:8px;height:8px;border-radius:50%;background:${severity === 'error' ? 'var(--color-accent-danger)' : 'var(--color-accent-warning)'};flex-shrink:0;"></span>
          ${title}
          <span style="font-size:var(--font-size-xs);color:var(--color-text-tertiary);">(${items.length})</span>
        </h4>
        <div style="background:var(--color-bg-tertiary);border-radius:var(--radius-md);padding:10px 14px;max-height:150px;overflow-y:auto;">
          ${items.slice(0, 50).map(item => `
            <div style="font-size:var(--font-size-sm);color:var(--color-text-secondary);padding:3px 0;border-bottom:1px solid var(--color-border-primary);">
              ${renderFn(item)}
            </div>
          `).join('')}
          ${items.length > 50 ? `<div style="font-size:var(--font-size-xs);color:var(--color-text-tertiary);padding:6px 0;">...و ${items.length - 50} مورد دیگر</div>` : ''}
        </div>
      </div>
    `;
  }

  _bindClose() {
    const backdrop = this.querySelector('#diagBackdrop');
    const closeBtn = this.querySelector('#closeDiag');
    if (backdrop) backdrop.addEventListener('click', (e) => { if (e.target === backdrop) this.hide(); });
    if (closeBtn) closeBtn.addEventListener('click', () => this.hide());
  }

  _handleKeydown(e) {
    if (e.key === 'Escape' && !this.classList.contains('hidden')) {
      this.hide();
    }
  }
}

customElements.define('diagnostics-modal', DiagnosticsModal);
