// Общая палитра акцента для десктопа и моб-версии.
// При каждой загрузке случайно выбирается один цвет и кладется в --accent / --accent-rgb.
(function () {
  var accents = [
    { hex: '#FFFFFF', rgb: '255, 255, 255' },
    { hex: '#5500FF', rgb: '85, 0, 255' },
    { hex: '#FF0000', rgb: '255, 0, 0' },
    { hex: '#C3FF00', rgb: '195, 255, 0' },
    { hex: '#FF00FB', rgb: '255, 0, 251' },
    { hex: '#FF0066', rgb: '255, 0, 102' },
    { hex: '#77FF00', rgb: '119, 255, 0' },
    { hex: '#F7FF00', rgb: '247, 255, 0' },
    { hex: '#FF7700', rgb: '255, 119, 0' }
  ];
  var pick = accents[Math.floor(Math.random() * accents.length)];
  document.documentElement.style.setProperty('--accent', pick.hex);
  document.documentElement.style.setProperty('--accent-rgb', pick.rgb);
})();
