console.log('IT’S ALIVE!');

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


let pages = [
  { url: '', title: 'Home' },
  { url: 'projects/', title: 'Projects' },
  { url: 'contact/', title: 'Contact' },
  { url: 'resume/', title: 'Resume' },
  { url: 'meta/', title: 'Meta' },
  { url: 'https://github.com/klh005', title: 'Github' }
];

let nav = document.createElement('nav');
document.body.prepend(nav);

for (let p of pages) {
  let url = p.url;
  let is_github = window.location.hostname === 'klh005.github.io';
  let title = p.title;

  let giturl = is_github ? '/portfolio/' : '/';

  if (!url.startsWith('http')) {
    url = `${giturl}${url}`;
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

  url = url.slice(0, -1);
  location.href = url;
});

// fetching json file
export async function fetchJSON(url) {
  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`HTTP error: ${response.status}`);
    return await response.json();
  } catch (error) {
    console.error("Fetch failed:", error);
  }
}

export function renderProjects(projects, container, headingLevel = 'h2') {
  container.innerHTML = '';
  projects.forEach(project => {
    const article = document.createElement('article');
    article.innerHTML = `
      <${headingLevel}>${project.title}</${headingLevel}>
      <img src="${project.image}" alt="${project.title}">
      <div class="project-info">
        <p>${project.description}</p>
        <small>Year: ${project.year}</small>
      </div>
    `;
    container.appendChild(article);
  });
}

export async function fetchGitHubData(username) {
  const data = await fetchJSON(`https://api.github.com/users/${username}`);
  return data;
}