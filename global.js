console.log('IT’S ALIVE!');

// helper funcs
function tagging(tag, options) {
  return Object.assign(document.createElement(tag), options);
}

// current page selector
function $$(selector, context = document) {
  return Array.from(context.querySelectorAll(selector));
}

let navLinks = $$("nav a");

let currentLink = navLinks.find(
  (a) => a.host === location.host && a.pathname === location.pathname
);

currentLink?.classList.add('current');

// navigation menu
const ARE_WE_HOME = document.documentElement.classList.contains('home');

let pages = [
  { url: '', title: 'Home' },
  { url: 'projects/', title: 'Projects' },
  { url: 'contact/', title: 'Contact' },
  { url: 'resume/', title: 'Resume' },
  { url: 'https://github.com/klh005', title: 'Github' }
];

let nav = document.createElement('nav');
document.body.prepend(nav);

for (let p of pages) {
  let url = p.url;
  let title = p.title;
  if (url.includes('github')) {
    url = !ARE_WE_HOME && !url.startsWith('http') ? '../' + url : 'portfolio/' + url;
  }
  else {
    url = !ARE_WE_HOME && !url.startsWith('http') ? '../' + url : url;
  }
  let a = document.createElement('a');
  a.href = url;
  a.textContent = title;
  if (url.startsWith('http')) {
    a.target = "_blank";
  }
  nav.append(a);
  if (a.host === location.host && a.pathname === location.pathname) {
    a.classList.add('current');
  }
}

// dark mode
document.body.insertAdjacentHTML(
  'afterbegin',
  `
    <label class="color-scheme">
      Theme:
      <select>
        <option value="light dark">Automatic</option>
        <option value="light">Light</option>
        <option value="dark">Dark</option>
      </select>
    </label>
  `
);

const colorSchemeSelect = document.querySelector('.color-scheme select');

colorSchemeSelect.addEventListener('input', (event) => {
  const selectedScheme = event.target.value;
  setColorScheme(selectedScheme);
  localStorage.colorScheme = selectedScheme;
});

if ('colorScheme' in localStorage) {
  const savedScheme = localStorage.colorScheme;
  setColorScheme(savedScheme);
  colorSchemeSelect.value = savedScheme;
} else {
  setColorScheme('light dark');
  colorSchemeSelect.value = 'light dark';
}

function setColorScheme(colorScheme) {
  document.documentElement.style.setProperty('color-scheme', colorScheme);
}

const osColorScheme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'Dark' : 'Light';
const automaticOption = document.querySelector('.color-scheme select option[value="light dark"]');
automaticOption.textContent = `Automatic (${osColorScheme})`;

// contact form
const form = document.querySelector('form');

form?.addEventListener('submit', (event) => {
  event.preventDefault();

  const data = new FormData(form);
  let url = form.action + '?';

  for (let [name, value] of data) {
    if (value) {
      url += `${name}=${encodeURIComponent(value)}&`;
    }
  }

  // Remove the trailing '&' or '?' if no parameters were added
  url = url.slice(0, -1);

  location.href = url;
});