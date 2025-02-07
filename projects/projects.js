import * as d3 from "https://cdn.jsdelivr.net/npm/d3@7.9.0/+esm";
import { fetchJSON, renderProjects } from '../global.js';

const projects = await fetchJSON('../lib/projects.json');
const projectsContainer = document.querySelector('.projects');
let selectedIndex = -1;
let query = '';

const svg = d3.select('#projects-pie-plot');
const legend = d3.select('.legend');
const colorScale = d3.scaleOrdinal(d3.schemeTableau10);
let currentData = [];

function renderPieChart() {
  const rolledData = d3.rollups(
    projects,
    v => v.length,
    d => d.year
  );

  currentData = rolledData.map(([year, count]) => ({
    value: count,
    label: String(year),
    year: year
  }));

  svg.selectAll('*').remove();
  legend.selectAll('*').remove();

  const pieGenerator = d3.pie().value(d => d.value);
  const arcGenerator = d3.arc().innerRadius(0).outerRadius(45);
  const arcs = pieGenerator(currentData);

  // wedges
  svg.selectAll('path')
    .data(arcs)
    .join('path')
    .attr('d', arcGenerator)
    .attr('fill', (_, i) => colorScale(i))
    .attr('class', (_, i) => selectedIndex === i ? 'selected' : '')
    .on('click', (_, d) => {
      const clickedIndex = currentData.findIndex(item => item.year === d.data.year);
      selectedIndex = selectedIndex === clickedIndex ? -1 : clickedIndex;
      updateDisplay();
    });

  legend.selectAll('li')
    .data(currentData)
    .join('li')
    .attr('style', (_, i) => `--color: ${colorScale(i)}`)
    .attr('class', (_, i) => selectedIndex === i ? 'selected' : '')
    .html(d => `
      <span class="swatch"></span>
      ${d.label} <em>(${d.value})</em>
    `)
    .on('click', (_, d) => {
      const clickedIndex = currentData.findIndex(item => item.year === d.data.year);
      selectedIndex = selectedIndex === clickedIndex ? -1 : clickedIndex;
      updateDisplay();
    });
}

function updateDisplay() {
  const selectedYear = selectedIndex === -1 
    ? null 
    : currentData[selectedIndex]?.label;

  const filteredProjects = projects.filter(p => {
    const matchesSearch = Object.values(p).join(' ')
      .toLowerCase().includes(query.toLowerCase());
      
    const matchesYear = !selectedYear || 
      String(p.year) === selectedYear;

    return matchesSearch && matchesYear;
  });

  renderProjects(filteredProjects, projectsContainer);
}

renderPieChart();
updateDisplay();

document.querySelector('.searchBar').addEventListener('input', (e) => {
  query = e.target.value;
  selectedIndex = -1;
  updateDisplay();
});