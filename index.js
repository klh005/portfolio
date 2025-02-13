import { fetchJSON, renderProjects } from './global.js';

const allProjects = await fetchJSON('./lib/projects.json');
const latestProjects = allProjects.slice(0, 3);
const homeProjectsContainer = document.querySelector('.projects');

if (homeProjectsContainer) {
  renderProjects(latestProjects, homeProjectsContainer, 'h2');
}


import { fetchGitHubData } from './global.js';

const githubData = await fetchGitHubData('klh005');

const profileStats = document.querySelector('#profile-stats');
if (profileStats && githubData) {
  profileStats.innerHTML = `
    <dl>
      <dt>Public Repos:</dt><dd>${githubData.public_repos}</dd>
      <dt>Public Gists:</dt><dd>${githubData.public_gists}</dd>
      <dt>Followers:</dt><dd>${githubData.followers}</dd>
      <dt>Following:</dt><dd>${githubData.following}</dd>
    </dl>
  `;
}
