export function createBackground(stage) {
  const background = document.createElement('div');
  background.className = 'california-background';
  background.setAttribute('aria-hidden', 'true');
  background.innerHTML = `
    <div class="background-sun"></div>
    <div class="background-haze background-haze-far"></div>
    <div class="background-haze background-haze-near"></div>
  `;
  stage.prepend(background);

  return {
    element: background,
    setImage(url = '') {
      background.style.setProperty('--background-image', url ? `url("${url}")` : 'none');
      background.classList.toggle('has-image', Boolean(url));
    },
    dispose() {
      background.remove();
    },
  };
}
