(() => {
  const root = document.querySelector('[data-workshop]');
  if (!root) return;

  const follow = root.querySelector('[data-follow]');
  const motion = root.querySelector('[data-motion]');
  const liveStatus = root.querySelector('[data-live-status]');
  const eventFeed = root.querySelector('[data-event-feed]');
  let timer;
  let currentState = root.dataset.state;
  const readPreference = (key, fallback) => {
    try { const value = localStorage.getItem(key); return value === null ? fallback : value === 'true'; }
    catch { return fallback; }
  };
  const savePreference = (key, value) => { try { localStorage.setItem(key, String(value)); } catch {} };

  const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;
  motion.checked = reducedMotion ? false : readPreference('codexbridge-workshop-motion', true);
  motion.disabled = reducedMotion;
  follow.checked = readPreference('codexbridge-workshop-follow', false);
  document.body.classList.toggle('workshop-no-motion', !motion.checked);
  motion.addEventListener('change', () => {
    document.body.classList.toggle('workshop-no-motion', !motion.checked);
    savePreference('codexbridge-workshop-motion', motion.checked);
  });

  function renderEvents(events) {
    eventFeed.replaceChildren();
    if (!events.length) {
      const empty = document.createElement('li');
      empty.textContent = 'Sem atividade conectada para esta tarefa.';
      eventFeed.append(empty);
      return;
    }
    for (const event of events.slice(-20).reverse()) {
      const row = document.createElement('li');
      const details = document.createElement('details');
      const summary = document.createElement('summary');
      const time = document.createElement('time');
      const date = new Date(event.at);
      time.dateTime = Number.isNaN(date.valueOf()) ? '' : date.toISOString();
      time.textContent = Number.isNaN(date.valueOf()) ? 'Horário indisponível' : date.toLocaleTimeString('pt-BR');
      summary.append(time, document.createTextNode(` · ${event.action}`));
      details.append(summary);
      const info = document.createElement('p');
      info.textContent = `Tipo de atividade: ${event.kind}`;
      details.append(info);
      row.append(details);
      eventFeed.append(row);
    }
  }

  async function update() {
    if (!follow.checked || document.visibilityState !== 'visible' || !['pending', 'approved', 'running'].includes(currentState)) return;
    try {
      const response = await fetch(root.dataset.activityUrl, { cache: 'no-store', credentials: 'same-origin' });
      if (!response.ok) throw new Error('snapshot indisponível');
      const snapshot = await response.json();
      currentState = snapshot.state;
      root.dataset.state = snapshot.state;
      liveStatus.textContent = snapshot.status;
      root.querySelectorAll('[data-station]').forEach(station => {
        const active = station.dataset.station === snapshot.station;
        station.classList.toggle('is-active', active);
        station.classList.toggle('is-complete', snapshot.completed_stations.includes(station.dataset.station));
      });
      const activeStation = root.querySelector('[data-active-station]');
      activeStation.textContent = snapshot.station_label;
      renderEvents(snapshot.events);
      const cancelForm = root.querySelector('[data-cancel-form]');
      if (cancelForm) cancelForm.hidden = !snapshot.can_cancel;
      if (snapshot.state !== 'running' && timer) { clearInterval(timer); timer = undefined; }
    } catch {
      liveStatus.textContent = 'Sem conexão com eventos de atividade. A tarefa continua sob o controle do CodexBridge.';
    }
  }

  function setFollowing() {
    savePreference('codexbridge-workshop-follow', follow.checked);
    if (timer) clearInterval(timer);
    timer = undefined;
    if (follow.checked && ['pending', 'approved', 'running'].includes(currentState)) {
      update();
      timer = setInterval(update, 4_000);
    }
  }
  follow.addEventListener('change', setFollowing);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') update(); });
  renderEvents(JSON.parse(root.dataset.initialEvents || '[]'));
  setFollowing();
})();
