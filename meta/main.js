let data = [];
let commits = [];
let brushSelection = null;
let xScale, yScale, rScale;
let currentCommitFilter = 'all';

const width = 1000;
const height = 600;
const margin = { top: 20, right: 30, bottom: 50, left: 60 };
const usableArea = {
    top: margin.top,
    right: width - margin.right,
    bottom: height - margin.bottom,
    left: margin.left,
    width: width - margin.left - margin.right,
    height: height - margin.top - margin.bottom,
};

async function loadData() {
    data = await d3.csv('loc.csv', row => ({
        ...row,
        line: +row.line,
        depth: +row.depth,
        length: +row.length,
        datetime: new Date(row.datetime),
        type: row.type
    }));
    
    processCommits();
    populateCommitDropdown();
    updateStatsAndChart();
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
                hourFrac: datetime.getHours() + datetime.getMinutes() / 60,
                totalLines: lines.length
            };

            Object.defineProperty(commitObj, 'lines', {
                value: lines,
                enumerable: false
            });

            return commitObj;
        });
}

function populateCommitDropdown() {
    const dropdown = d3.select('#commit-dropdown');
    commits.forEach(commit => {
        dropdown.append('option')
            .attr('value', commit.id)
            .text(commit.id.slice(0, 7));
    });

    dropdown.on('change', function() {
        currentCommitFilter = this.value;
        updateStatsAndChart();
    });
}

function updateStatsAndChart() {
    brushSelection = null; // Reset selection
    const commitsToDisplay = filterCommits();
    displayStats(commitsToDisplay);
    createScatterplot(commitsToDisplay);
}

function filterCommits() {
    return currentCommitFilter === 'all' 
        ? commits 
        : commits.filter(commit => commit.id === currentCommitFilter);
}

function displayStats(commitsToUse) {
    const stats = d3.select('#stats');
    stats.selectAll('*').remove();
    const dl = stats.append('dl').attr('class', 'stats');

    const totalLOC = commitsToUse.reduce((sum, c) => sum + c.totalLines, 0);
    dl.append('dt').html('Total <abbr title="Lines of code">LOC</abbr>');
    dl.append('dd').text(totalLOC);

    dl.append('dt').text('Commits Displayed');
    dl.append('dd').text(commitsToUse.length);

    const files = new Set(commitsToUse.flatMap(c => c.lines.map(l => l.file)));
    dl.append('dt').text('Files Modified');
    dl.append('dd').text(files.size);

    const fileLengths = d3.rollup(
        commitsToUse.flatMap(c => c.lines),
        v => v.length,
        d => d.file
    );
    const maxLength = d3.max([...fileLengths.values()]);
    dl.append('dt').text('Longest File (LOC)');
    dl.append('dd').text(maxLength);
}

function createScatterplot(commitsToUse) {
    d3.select('#chart svg').remove();
    if (commitsToUse.length === 0) return;

    const svg = d3.select('#chart')
        .append('svg')
        .attr('viewBox', `0 0 ${width} ${height}`);

    // Scales
    xScale = d3.scaleTime()
        .domain(d3.extent(commitsToUse, d => d.datetime))
        .range([usableArea.left, usableArea.right])
        .nice();

    yScale = d3.scaleLinear()
        .domain([0, 24])
        .range([usableArea.bottom, usableArea.top]);

    rScale = d3.scaleSqrt()
        .domain(d3.extent(commitsToUse, d => d.totalLines))
        .range([2, 15]);

    // Gridlines
    svg.append('g')
        .attr('class', 'gridlines')
        .attr('transform', `translate(${usableArea.left},0)`)
        .call(d3.axisLeft(yScale)
            .tickSize(-usableArea.width)
            .tickFormat(''));

    // Axes
    svg.append('g')
        .attr('transform', `translate(0,${usableArea.bottom})`)
        .call(d3.axisBottom(xScale));

    svg.append('g')
        .attr('transform', `translate(${usableArea.left},0)`)
        .call(d3.axisLeft(yScale).tickFormat(d => `${String(d % 24).padStart(2, '0')}:00`));

    // Dots
    const dotsGroup = svg.append('g').attr('class', 'dots');
    const sortedCommits = d3.sort(commitsToUse, d => -d.totalLines);

    dotsGroup.selectAll('circle')
    .data(sortedCommits)
    .join('circle')
    .attr('cx', d => xScale(d.datetime))
    .attr('cy', d => yScale(d.hourFrac))
    .attr('r', d => rScale(d.totalLines))
    .attr('fill', 'steelblue') // Use attr instead of style
    .style('opacity', 0.7)
    .on('mouseenter', function(event, d) {
        d3.select(this).raise(); // Bring hovered circle to front
        showTooltip(event, d);
      })
    .on('mousemove', function(event) {
    d3.select('#commit-tooltip')
        .style('left', `${event.pageX + 15}px`)
        .style('top', `${event.pageY - 30}px`);
    })
    .on('mouseleave', function() {
    hideTooltip();
    });

    setupBrush(svg);
}

function setupBrush(svg) {
    svg.selectAll('.brush').remove();

    const brush = d3.brush()
        .extent([[usableArea.left, usableArea.top], [usableArea.right, usableArea.bottom]])
        .on('brush end', brushed);

    svg.append('g')
        .attr('class', 'brush')
        .call(brush);

    svg.selectAll('.dots').raise();
  }

function brushed(event) {
    brushSelection = event.selection;
    updateSelection();
}

function updateSelection() {
    d3.selectAll('#chart circle')
      .classed('selected', d => isCommitSelected(d));
    
    const selectedCommits = brushSelection 
      ? getDisplayedCommits().filter(isCommitSelected)
      : [];
    
    d3.select('#selection-count')
      .text(`${selectedCommits.length || 'No'} commits selected`);
    
    updateLanguageBreakdown(selectedCommits);
}

function isCommitSelected(commit) {
    if (!brushSelection) return false;
    const [[x0, y0], [x1, y1]] = brushSelection;
    const x = xScale(commit.datetime);
    const y = yScale(commit.hourFrac);
    return x0 <= x && x <= x1 && y0 <= y && y <= y1;
}

function getDisplayedCommits() {
    return filterCommits();
}

function showTooltip(event, d) {
    const tooltip = d3.select('#commit-tooltip');
    
    console.log('Commit data:', d); 
    
    tooltip
      .html(`
        <dt>Commit</dt>
        <dd><a href="${d.url}" target="_blank">${d.id.slice(0,7)}</a></dd>
        <dt>Date</dt>
        <dd>${d.datetime.toLocaleDateString()}</dd>
        <dt>Time</dt>
        <dd>${d.datetime.toLocaleTimeString()}</dd>
        <dt>Author</dt>
        <dd>${d.author}</dd>
        <dt>Lines</dt>
        <dd>${d.totalLines}</dd>
      `)
      .style('left', `${event.pageX + 15}px`)
      .style('top', `${event.pageY - 30}px`)
      .classed('visible', true)
      .attr('hidden', null);
  }

function hideTooltip() {
d3.select('#commit-tooltip')
    .classed('visible', false);
}

function updateTooltipPosition(event) {
    d3.select('#commit-tooltip')
        .style('left', `${event.pageX + 15}px`)
        .style('top', `${event.pageY - 30}px`);
}

function updateLanguageBreakdown(selectedCommits) {
    const commitsToUse = selectedCommits?.length ? selectedCommits : getDisplayedCommits();
    const lines = commitsToUse.flatMap(c => c.lines);
    const languages = d3.rollup(lines, v => v.length, d => d.type);
    const total = d3.sum([...languages.values()]);
    
    const breakdown = d3.select('#language-breakdown');
    breakdown.selectAll('*').remove();

    if (total === 0) {
        breakdown.append('dt').text('No language data');
        return;
    }

    languages.forEach((count, lang) => {
        const percent = d3.format('.1%')(count / total);
        breakdown.append('dt').text(lang);
        breakdown.append('dd').text(`${count} (${percent})`);
    });
}

document.addEventListener('DOMContentLoaded', loadData);