import { weatherIcon } from './art.js';

export class WeatherView {
  constructor(app) {
    this.app = app;
    this.button = document.getElementById('weather-chip');
    this.panel = document.getElementById('weather-detail');
    this.name = document.getElementById('weather-detail-name');
    this.description = document.getElementById('weather-detail-description');
    this.remaining = document.getElementById('weather-detail-remaining');
    this.icon = this.panel.querySelector('.weather-detail-icon');
    this.button.addEventListener('click', () => this.setOpen(this.panel.hidden));
    this.panel.querySelector('.weather-detail-close').addEventListener('click', () => this.setOpen(false, true));
    app.addEventListener('click', event => {
      if (this.panel.hidden || this.panel.contains(event.target) || this.button.contains(event.target)) return;
      this.setOpen(false);
    });
    app.addEventListener('keydown', event => {
      if (event.key !== 'Escape' || this.panel.hidden) return;
      event.preventDefault();
      event.stopPropagation();
      this.setOpen(false, true);
    }, true);
  }

  setOpen(open, returnFocus = false) {
    if (open && this.button.hidden) return;
    this.panel.hidden = !open;
    this.button.setAttribute('aria-expanded', String(open));
    if (returnFocus && !this.button.hidden) this.button.focus({ preventScroll: true });
  }

  update(weather) {
    if (weather) this.app.dataset.weather = weather.type;
    else delete this.app.dataset.weather;
    this.button.hidden = !weather;
    if (!weather) {
      this.setOpen(false);
      return;
    }
    const { type, icon, name, description, roundsLeft } = weather;
    const remaining = roundsLeft == null ? '' : `あと${roundsLeft}周`;
    const label = `天候：${name}${remaining ? `、${remaining}` : ''}`;
    if (this.button.getAttribute('aria-label') !== label || this.button.dataset.type !== type) {
      const caption = document.createElement('span');
      caption.className = 'hud-weather-caption';
      const heading = document.createElement('b');
      heading.textContent = name;
      caption.append(heading);
      if (remaining) {
        const time = document.createElement('small');
        time.textContent = remaining;
        caption.append(time);
      }
      this.button.replaceChildren(weatherIcon(type, icon), caption);
      this.button.dataset.type = type;
      this.button.setAttribute('aria-label', label);
    }
    if (this.icon.dataset.type !== type) {
      this.icon.replaceChildren(weatherIcon(type, icon));
      this.icon.dataset.type = type;
    }
    this.name.textContent = name;
    this.description.textContent = description ?? '';
    this.remaining.textContent = remaining ? `残り ${roundsLeft}周` : '残り周回数は不明です';
  }
}
