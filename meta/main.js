let data = [];
let commits = [];
let brushSelection = null;
let xScale, yScale, rScale;
let currentCommitFilter = 'all'; // Keep track of the selected commit filter

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
    populateCommitDropdown(); // Populate the dropdown
    updateStatsAndChart();    // Initial update with all commits
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
                totalLines: lines.length,
                date: first.date,
                time: first.time,
                timezone: first.timezone
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

    // Add options for each commit ID
    commits.forEach(commit => {
        dropdown.append('option')
            .attr('value', commit.id)
            .text(commit.id.slice(0, 7)); // Display shortened commit ID
    });

    // Event listener for dropdown change
    dropdown.on('change', function() {
        currentCommitFilter = this.value;
        updateStatsAndChart(); // Update stats and chart based on selected commit
    });
}

function updateStatsAndChart() {
    const commitsToDisplay = filterCommits(); // Get commits based on filter

    displayStats(commitsToDisplay);
    createScatterplot(commitsToDisplay); // Pass filtered commits to scatterplot
}

function filterCommits() {
    if (currentCommitFilter === 'all') {
        return commits; // Show all commits
    } else {
        // Filter to only include the selected commit (or commits up to it, adjust as needed)
        return commits.filter(commit => commit.id === currentCommitFilter);
    }
}


function displayStats(commitsToUse) { // Accept commitsToUse as argument
    const stats = d3.select('#stats')
        .selectAll('*').remove() // Clear previous stats
        .append('dl')
        .attr('class', 'stats');

    stats.append('dt').html('Total <abbr title="Lines of code">LOC</abbr>');
    stats.append('dd').text(data.length); // Total LOC is still based on all data

    stats.append('dt').text('Commits Displayed'); // Updated label
    stats.append('dd').text(commitsToUse.length); // Display count of filtered commits

    const fileCount = d3.group(data, d => d.file).size;
    stats.append('dt').text('Number of Files');
    stats.append('dd').text(fileCount);

    const maxFileLineCount = d3.max(d3.rollup(data, v => v.length, d => d.file).values());
    stats.append('dt').text('Max File Length (LOC)');
    stats.append('dd').text(maxFileLineCount);
}

function createScatterplot(commitsToUse) { // Accept commitsToUse as argument
    d3.select('#chart svg').remove(); // Clear previous chart

    if (commitsToUse.length === 0) {
        d3.select('#chart').append('p').text("No commits to display for this selection.");
        return; // Exit if no commits to display
    }

    const svg = d3.select('#chart')
        .append('svg')
        .attr('viewBox', `0 0 ${width} ${height}`);

    xScale = d3.scaleTime()
        .domain(d3.extent(commitsToUse, d => d.datetime)) // Use filtered commits
        .range([usableArea.left, usableArea.right])
        .nice();

    yScale = d3.scaleLinear()
        .domain([0, 24])
        .range([usableArea.bottom, usableArea.top]);

    rScale = d3.scaleSqrt()
        .domain(d3.extent(commitsToUse, d => d.totalLines)) // Use filtered commits
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

    const dotsGroup = svg.append('g').attr('class', 'dots');
    const sortedCommits = d3.sort(commitsToUse, (d) => -d.totalLines); // Sort filtered commits

    // Dots
    dotsGroup.selectAll('circle')
        .data(sortedCommits) // Use sorted and filtered commits
        .join('circle')
        .attr('cx', d => xScale(d.datetime))
        .attr('cy', d => yScale(d.hourFrac))
        .attr('r', d => rScale(d.totalLines))
        .style('fill-opacity', 0.7)
        .on('mouseenter', function (event, d) {
            d3.select(this).style('fill-opacity', 1);
            showTooltip(event, d);
        })
        .on('mouseleave', function () {
            d3.select(this).style('fill-opacity', 0.7);
            hideTooltip();
        });
}

function setupBrush() {
    const svg = d3.select('#chart svg');

    // ... (rest of setupBrush function is the same) ...
    const brush = d3.brush()
        .extent([[usableArea.left, usableArea.top], [usableArea.right, usableArea.bottom]])
        .on('brush end', brushed);

    svg.append('g')
       .attr("class", "brush")
       .call(brush);

    d3.select('#chart svg').selectAll('.dots, .brush ~ *').raise();
}


function brushed(event) {
    brushSelection = event.selection;
    updateSelection();
}

function isCommitSelected(commit) {
    if (!brushSelection) return false;

    const [ [x0, y0], [x1, y1] ] = brushSelection;
    const x = xScale(commit.datetime);
    const y = yScale(commit.hourFrac);

    return x0 <= x && x <= x1 && y0 <= y && y <= y1;
}


function updateSelection() {
    const circles = d3.selectAll('#chart circle');
    circles.classed('selected', d => isCommitSelected(d));

    const selectedCommits = brushSelection ? getDisplayedCommits().filter(isCommitSelected) : []; // Use displayed commits for selection
    const selectedCount = selectedCommits.length;

    d3.select('#selection-count').text(`${selectedCount > 0 ? selectedCount : 'No'} commits selected`);
    updateLanguageBreakdown(selectedCommits);
}

function getDisplayedCommits() { // Helper function to get currently displayed commits
    return filterCommits(); // Use the same filtering logic
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
    `).style('left', `${event.clientX + 10}px`)
      .style('top', `${event.clientY - 20}px`)
      .attr('hidden', null);
}


function hideTooltip() {
    d3.select('#commit-tooltip').attr('hidden', true);
}

function updateLanguageBreakdown(selectedCommits) {
    const commitsToUse = selectedCommits && selectedCommits.length > 0 ? selectedCommits : getDisplayedCommits(); // Use displayed commits for breakdown
    const lines = commitsToUse.flatMap(d => d.lines);

    const languages = d3.rollup(lines, v => v.length, d => d.type);
    const total = d3.sum([...languages.values()]);

    const breakdown = d3.select('#language-breakdown');
    breakdown.selectAll("*").remove();

    if (total === 0) {
        breakdown.append("dt").text("No language data");
        return;
    }

    for (const [lang, count] of languages) {
        const proportion = count / total;
        const formattedProportion = d3.format(".1~%")(proportion);

        breakdown.append("dt").text(lang);
        breakdown.append("dd").text(`${count} lines (${formattedProportion})`);
    }
}


document.addEventListener('DOMContentLoaded', loadData);