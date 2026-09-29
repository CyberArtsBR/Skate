export function createBackground(stage, { imageUrl = '', position = 'center center' } = {}) {
  const background = document.createElement('div');
  background.className = 'california-background';
  background.setAttribute('aria-hidden', 'true');
  background.innerHTML = `
    <div class="background-plate"></div>
    <div class="background-grade"></div>
  `;
  stage.prepend(background);

  const plate = background.querySelector('.background-plate');
  const grade = background.querySelector('.background-grade');
  const state = {
    imageUrl: '',
    naturalWidth: 0,
    naturalHeight: 0,
    coherence: null,
  };

  function setCoherence({
    brightness = 0.94,
    saturation = 0.96,
    contrast = 0.97,
    gradeOpacity = 0.72,
  } = {}) {
    const safeBrightness = Math.max(0.5, Math.min(1.25, Number(brightness) || 0.94));
    const safeSaturation = Math.max(0.5, Math.min(1.35, Number(saturation) || 0.96));
    const safeContrast = Math.max(0.5, Math.min(1.35, Number(contrast) || 0.97));
    const safeGradeOpacity = Math.max(0, Math.min(1, Number(gradeOpacity) || 0));

    plate.style.filter = `saturate(${safeSaturation}) contrast(${safeContrast}) brightness(${safeBrightness})`;
    grade.style.opacity = String(safeGradeOpacity);
    state.coherence = {
      brightness: safeBrightness,
      saturation: safeSaturation,
      contrast: safeContrast,
      gradeOpacity: safeGradeOpacity,
    };
    return { ...state.coherence };
  }

  function setImage(url = '', nextPosition = position) {
    if (!url) {
      plate.style.removeProperty('--background-image');
      plate.style.removeProperty('--background-position');
      background.classList.remove('has-image');
      delete background.dataset.assetUrl;
      Object.assign(state, { imageUrl: '', naturalWidth: 0, naturalHeight: 0 });
      return Promise.resolve({ ...state });
    }

    return new Promise((resolve, reject) => {
      const image = new Image();
      image.decoding = 'async';
      image.onload = () => {
        plate.style.setProperty('--background-image', `url("${url}")`);
        plate.style.setProperty('--background-position', nextPosition);
        background.classList.add('has-image');
        background.dataset.assetUrl = url;
        Object.assign(state, {
          imageUrl: url,
          naturalWidth: image.naturalWidth,
          naturalHeight: image.naturalHeight,
        });
        resolve({ ...state });
      };
      image.onerror = () => reject(new Error(`Could not load background image: ${url}`));
      image.src = url;
    });
  }

  setCoherence();

  const api = {
    element: background,
    state,
    setImage,
    setCoherence,
    ready: null,
    dispose() {
      background.remove();
    },
  };
  api.ready = setImage(imageUrl);
  return api;
}
