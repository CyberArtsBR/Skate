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
  const state = {
    imageUrl: '',
    naturalWidth: 0,
    naturalHeight: 0,
  };

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

  const api = {
    element: background,
    state,
    setImage,
    ready: null,
    dispose() {
      background.remove();
    },
  };
  api.ready = setImage(imageUrl);
  return api;
}
