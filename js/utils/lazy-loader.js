/**
 * Lazy Loading Module
 * Intersection Observer-based lazy loading for images and components
 */

class LazyLoader {
  constructor() {
    this._observer = null;
    this._init();
  }

  _init() {
    this._observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          const el = entry.target;
          this._loadElement(el);
          this._observer.unobserve(el);
        }
      });
    }, {
      rootMargin: '200px 0px',
      threshold: 0.01
    });
  }

  observe(el) {
    if (el) this._observer.observe(el);
  }

  unobserve(el) {
    if (el) this._observer.unobserve(el);
  }

  _loadElement(el) {
    if (el.tagName === 'IMG' && el.dataset.src) {
      el.src = el.dataset.src;
      el.removeAttribute('data-src');
      el.classList.add('loaded');
      el.addEventListener('error', () => {
        el.classList.add('load-error');
      }, { once: true });
    }

    if (el.dataset.lazyComponent) {
      el.dispatchEvent(new CustomEvent('lazy-load'));
    }
  }

  disconnect() {
    if (this._observer) this._observer.disconnect();
  }
}

const lazyLoader = new LazyLoader();
export default lazyLoader;
