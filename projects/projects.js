import * as d3 from "https://cdn.jsdelivr.net/npm/d3@7.9.0/+esm";
import { fetchJSON, renderProjects } from '../global.js';

const projects = await fetchJSON('../lib/projects.json');
const projectsContainer = document.querySelector('.projects');
let selectedIndex = -1;
let query = '';

const svg = d3.select('#projects-pie-plot');
const legend = d3.select('.legend');
const colorScale = d3.scaleOrdinal(d3.schemeTableau10);

function renderPieChart(filteredProjects) {
  const rolledData = d3.rollups(
    filteredProjects,
    v => v.length,
    d => d.year
  );
  
  const data = rolledData.map(([year, count]) => ({
    value: count,
    label: String(year)
  }));

  svg.selectAll('*').remove();
  legend.selectAll('*').remove();


  const pieGenerator = d3.pie().value(d => d.value);
  const arcGenerator = d3.arc().innerRadius(0).outerRadius(45);
  const arcs = pieGenerator(data);

  svg.selectAll('path')
    .data(arcs)
    .join('path')
    .attr('d', arcGenerator)
    .attr('fill', (_, i) => colorScale(i))
    .attr('class', (_, i) => selectedIndex === i ? 'selected' : '')
    .on('click', (_, i) => {
      selectedIndex = selectedIndex === i ? -1 : i;
      updateDisplay();
    });

  legend.selectAll('li')
    .data(data)
    .join('li')
    .attr('style', (_, i) => `--color: ${colorScale(i)}`)
    .attr('class', (_, i) => selectedIndex === i ? 'selected' : '')
    .html(d => `
      <span class="swatch"></span>
      ${d.label} <em>(${d.value})</em>
    `)
    .on('click', (_, i) => {
      selectedIndex = selectedIndex === i ? -1 : i;
      updateDisplay();
    });
}

function updateDisplay() {
  let filtered = projects.filter(p => {
    const values = Object.values(p).join(' ').toLowerCase();
    const matchesSearch = values.includes(query.toLowerCase());
    const yearMatch = selectedIndex === -1 || 
      String(p.year) === data[selectedIndex]?.label;
    
    return matchesSearch && yearMatch;
  });
  renderProjects(filtered, projectsContainer);
  renderPieChart(filtered);
}

renderPieChart(projects);
renderProjects(projects, projectsContainer);

document.querySelector('.searchBar').addEventListener('input', (e) => {
  query = e.target.value;
  selectedIndex = -1;
  updateDisplay();
});