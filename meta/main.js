let data = [];
let commits = [];
let brushSelection = null;
let xScale, yScale, rScale;

const width = 1000;
const height = 600;
const margin = { top: 20, right: 30, bottom: 50, left: 60 };

async function loadData() {
    data = await d3.csv('loc.csv', row => ({
        ...row,
        line: +row.line,
        depth: +row.depth,
        length: +row.length,
        datetime: new Date(row.datetime),
    }));
    
    processCommits();
    displayStats();
    createScatterplot();
    setupBrush();
}

function processCommits() {
    commits = d3.groups(data, d => d.commit)
        .map(([commit, lines]) => {
            const first = lines[0];
            const datetime = new Date(first.datetime);
            
            const commitObj = {
                id: commit,
                url: `https://github.com/klh005/portfolio/commit/${commit}`,
                author: first.author,
                datetime,
                hourFrac: datetime.getHours() + datetime.getMinutes()/60,
                totalLines: lines.length
            };

            Object.defineProperty(commitObj, 'lines', {
                value: lines,
                enumerable: false
            });

            return commitObj;
        });
}

function displayStats() {
    const stats = d3.select('#stats')
        .append('dl')
        .attr('class', 'stats');

    stats.append('dt').text('Total Lines');
    stats.append('dd').text(data.length);

    stats.append('dt').text('Total Commits');
    stats.append('dd').text(commits.length);
}

function createScatterplot() {
    const svg = d3.select('#chart')
        .append('svg')
        .attr('viewBox', `0 0 ${width} ${height}`);

    xScale = d3.scaleTime()
        .domain(d3.extent(commits, d => d.datetime))
        .range([margin.left, width - margin.right]);

    yScale = d3.scaleLinear()
        .domain([0, 24])
        .range([height - margin.bottom, margin.top]);

    rScale = d3.scaleSqrt()
        .domain(d3.extent(commits, d => d.totalLines))
        .range([2, 15]);

    // Axes
    svg.append('g')
        .attr('transform', `translate(0,${height - margin.bottom})`)
        .call(d3.axisBottom(xScale));

    svg.append('g')
        .attr('transform', `translate(${margin.left},0)`)
        .call(d3.axisLeft(yScale).tickFormat(d => `${d % 24}:00`));

    // Gridlines
    svg.append('g')
        .attr('class', 'gridlines')
        .call(d3.axisLeft(yScale)
            .tickSize(-width + margin.left + margin.right)
            .tickFormat(''));

    // Dots
    svg.selectAll('circle')
        .data(commits)
        .join('circle')
        .attr('cx', d => xScale(d.datetime))
        .attr('cy', d => yScale(d.hourFrac))
        .attr('r', d => rScale(d.totalLines))
        .on('mouseenter', function(event, d) {
            d3.select(this).classed('hover', true);
            showTooltip(event, d);
        })
        .on('mouseleave', function() {
            d3.select(this).classed('hover', false);
            hideTooltip();
        });
}

function setupBrush() {
    const svg = d3.select('svg');
    
    const brush = d3.brush()
        .extent([[margin.left, margin.top], [width - margin.right, height - margin.bottom]])
        .on('end', brushed);

    svg.call(brush);
}

function brushed(event) {
    brushSelection = event.selection;
    updateSelection();
}

function updateSelection() {
    const circles = d3.selectAll('circle');
    
    if (!brushSelection) {
        circles.classed('selected', false);
        d3.select('#selection-count').text('No commits selected');
        return;
    }

    const [[x0, y0], [x1, y1]] = brushSelection;
    
    circles.classed('selected', d => 
        xScale(d.datetime) >= x0 &&
        xScale(d.datetime) <= x1 &&
        yScale(d.hourFrac) >= y0 &&
        yScale(d.hourFrac) <= y1
    );

    const selectedCount = circles.filter('.selected').size();
    d3.select('#selection-count').text(`${selectedCount} commits selected`);
    updateLanguageBreakdown();
}

function showTooltip(event, d) {
    const tooltip = d3.select('#commit-tooltip');
    tooltip.html(`
        <dt>Commit</dt>
        <dd><a href="${d.url}" target="_blank">${d.id.slice(0, 7)}</a></dd>
        <dt>Date</dt>
        <dd>${d.datetime.toLocaleDateString()}</dd>
        <dt>Time</dt>
        <dd>${d.datetime.toLocaleTimeString()}</dd>
        <dt>Author</dt>
        <dd>${d.author}</dd>
        <dt>Lines</dt>
        <dd>${d.totalLines}</dd>
    `).attr('hidden', null);
}

function hideTooltip() {
    d3.select('#commit-tooltip').attr('hidden', true);
}

function updateLanguageBreakdown() {
    const selected = d3.selectAll('.selected').data();
    const lines = selected.length > 0 
        ? selected.flatMap(d => d.lines)
        : data;

    const languages = d3.rollup(lines, v => v.length, d => d.type);
    const total = d3.sum([...languages.values()]);

    const breakdown = d3.select('#language-breakdown')
        .selectAll('*')
        .remove()
        .selectAll('div')
        .data([...languages])
        .join('div');

    breakdown.html(([lang, count]) => `
        <dt>${lang}</dt>
        <dd>${count} (${((count / total) * 100).toFixed(1)}%)</dd>
    `);
}

document.addEventListener('DOMContentLoaded', loadData);