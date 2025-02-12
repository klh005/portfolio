let data = [];
let commits = [];
let brushSelection = null;
let xScale, yScale, rScale;

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
        type: row.type // Ensure 'type' is kept as is (string)
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
                hourFrac: datetime.getHours() + datetime.getMinutes() / 60,
                totalLines: lines.length,
                date: first.date, // Keep date for summary stats if needed
                time: first.time, // Keep time for summary stats if needed
                timezone: first.timezone // Keep timezone for summary stats if needed
            };

            Object.defineProperty(commitObj, 'lines', {
                value: lines,
                enumerable: false // Hide from console.log by default
            });

            return commitObj;
        });
}

function displayStats() {
    const stats = d3.select('#stats')
        .append('dl')
        .attr('class', 'stats');

    stats.append('dt').html('Total <abbr title="Lines of code">LOC</abbr>'); // Corrected to Total LOC
    stats.append('dd').text(data.length);

    stats.append('dt').text('Total Commits');
    stats.append('dd').text(commits.length);

    // Example of more stats you can add (Step 1.3):
    const fileCount = d3.group(data, d => d.file).size;
    stats.append('dt').text('Number of Files');
    stats.append('dd').text(fileCount);

    const maxFileLineCount = d3.max(d3.rollup(data, v => v.length, d => d.file).values());
    stats.append('dt').text('Max File Length (LOC)');
    stats.append('dd').text(maxFileLineCount);
}

function createScatterplot() {
    const svg = d3.select('#chart')
        .append('svg')
        .attr('viewBox', `0 0 ${width} ${height}`);

    xScale = d3.scaleTime()
        .domain(d3.extent(commits, d => d.datetime))
        .range([usableArea.left, usableArea.right]) // Use usableArea
        .nice(); // Add nice for cleaner axis

    yScale = d3.scaleLinear()
        .domain([0, 24])
        .range([usableArea.bottom, usableArea.top]); // Use usableArea

    rScale = d3.scaleSqrt()
        .domain(d3.extent(commits, d => d.totalLines))
        .range([2, 15]);

    // Gridlines (before axes)
    svg.append('g')
        .attr('class', 'gridlines')
        .attr('transform', `translate(${usableArea.left},0)`)
        .call(d3.axisLeft(yScale)
            .tickSize(-usableArea.width) // Use usableArea width
            .tickFormat(''));

    // Axes
    svg.append('g')
        .attr('transform', `translate(0,${usableArea.bottom})`)
        .call(d3.axisBottom(xScale));

    svg.append('g')
        .attr('transform', `translate(${usableArea.left},0)`)
        .call(d3.axisLeft(yScale).tickFormat(d => `${String(d % 24).padStart(2, '0')}:00`)); // Formatted time

    const dotsGroup = svg.append('g').attr('class', 'dots'); // Group for dots

    // Sort commits by total lines in descending order for better interaction (Step 4.3)
    const sortedCommits = d3.sort(commits, (d) => -d.totalLines);

    // Dots
    dotsGroup.selectAll('circle')
        .data(sortedCommits) // Use sortedCommits
        .join('circle')
        .attr('cx', d => xScale(d.datetime))
        .attr('cy', d => yScale(d.hourFrac))
        .attr('r', d => rScale(d.totalLines))
        .style('fill-opacity', 0.7) // Add some transparency for overlap
        .on('mouseenter', function (event, d) {
            d3.select(this).style('fill-opacity', 1); // Full opacity on hover
            showTooltip(event, d);
        })
        .on('mouseleave', function () {
            d3.select(this).style('fill-opacity', 0.7); // Restore transparency
            hideTooltip();
        });
}

function setupBrush() {
    const svg = d3.select('#chart svg'); // Select the svg element inside #chart

    const brush = d3.brush()
        .extent([[usableArea.left, usableArea.top], [usableArea.right, usableArea.bottom]]) // Use usableArea extent
        .on('brush end', brushed); // Listen to 'brush end' event

    svg.append('g') // Append a group for the brush to keep it organized
       .attr("class", "brush") // Add class for potential styling
       .call(brush);

    d3.select('#chart svg').selectAll('.dots, .brush ~ *').raise(); // Raise dots and elements after brush overlay
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
    const circles = d3.selectAll('#chart circle'); // Select circles within the chart
    circles.classed('selected', d => isCommitSelected(d));

    const selectedCommits = brushSelection ? commits.filter(isCommitSelected) : [];
    const selectedCount = selectedCommits.length;

    d3.select('#selection-count').text(`${selectedCount > 0 ? selectedCount : 'No'} commits selected`);
    updateLanguageBreakdown(selectedCommits); // Pass selected commits to language breakdown
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
    `).style('left', `${event.clientX + 10}px`)   // Position tooltip near mouse, offset by 10px
      .style('top', `${event.clientY - 20}px`)    // Position tooltip above mouse, offset by 20px
      .attr('hidden', null);
}


function hideTooltip() {
    d3.select('#commit-tooltip').attr('hidden', true);
}

function updateLanguageBreakdown(selectedCommits) { // Accept selectedCommits as argument
    const commitsToUse = selectedCommits && selectedCommits.length > 0 ? selectedCommits : commits;
    const lines = commitsToUse.flatMap(d => d.lines);

    const languages = d3.rollup(lines, v => v.length, d => d.type);
    const total = d3.sum([...languages.values()]);

    const breakdown = d3.select('#language-breakdown');
    breakdown.selectAll("*").remove(); // Clear previous breakdown

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