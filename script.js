// Language toggle — remembers the visitor's choice in localStorage
(function () {
  const body = document.body;
  const toggleBtn = document.getElementById('langToggle');
  const saved = localStorage.getItem('ca_lang');

  if (saved === 'te') {
    body.classList.add('lang-te');
  }

  toggleBtn.addEventListener('click', function () {
    body.classList.toggle('lang-te');
    const current = body.classList.contains('lang-te') ? 'te' : 'en';
    localStorage.setItem('ca_lang', current);
    document.documentElement.lang = current;
  });

  // Mobile menu
  const menuBtn = document.getElementById('menuBtn');
  const navList = document.getElementById('navList');
  menuBtn.addEventListener('click', function () {
    navList.classList.toggle('open');
  });

  // Footer year
  const year = new Date().getFullYear();
  const yEn = document.getElementById('year-en');
  const yTe = document.getElementById('year-te');
  if (yEn) yEn.textContent = year;
  if (yTe) yTe.textContent = year;
})();
