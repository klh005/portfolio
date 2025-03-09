// Global variables
let data = [];
let commits = [];
let selectedCommits = [];
let filteredCommits = [];
let xScale, yScale, rScale;
let commitProgress = 100;
let timeScale;
let commitMaxTime;
let commitData; // Variable to store data for daily commits scrollytelling

// Chart dimensions
const width = 1100;
const height = 700;
const margin = { top: 40, right: 40, bottom: 60, left: 70 };
const usableArea = {
    top: margin.top,
    right: width - margin.right,
    bottom: height - margin.bottom,
    left: margin.left,
    width: width - margin.left - margin.right,
    height: height - margin.top - margin.bottom,
};

// Scrollytelling variables
let NUM_ITEMS = 100; 
let ITEM_HEIGHT = 150; // Increased to match CSS
let VISIBLE_COUNT = 10;
let totalHeight;

/**
 * Load and process data from CSV
 */
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
    
    // Initialize time scale for slider
    timeScale = d3.scaleTime()
        .domain([
            d3.min(commits, d => d.datetime),
            d3.max(commits, d => d.datetime)
        ])
        .range([0, 100]);
    
    // Set up the time slider
    initializeTimeSlider();
    
    // Initial filter and update
    filterCommitsByTime();
    updateStatsAndChart();
    
    // Initialize the file visualization
    displayCommitFiles(filteredCommits);
    
    // Initialize scrollytelling
    NUM_ITEMS = commits.length;
    totalHeight = (NUM_ITEMS - 1) * ITEM_HEIGHT;
    initializeScrollytelling();
    
    // Convert commits to format needed for daily commits visualization
    // This maps our existing data structure to the one expected by displayDailyCommits
    commitData = commits.map(commit => {
        return {
            date: commit.datetime.toISOString(),
            files: commit.lines.map(line => ({
                filename: line.file,
                additions: 1, // Each line counts as one addition
                deletions: 0
            }))
        };
    });

}

/**
 * Process raw data into commit objects
 */
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
    
    // Sort commits by date
    commits = commits.sort((a, b) => a.datetime - b.datetime);
}

/**
 * Initialize the time slider for filtering commits
 */
function initializeTimeSlider() {
    const timeSlider = document.getElementById('commitProgressSlider');
    const selectedTimeElement = document.getElementById('selectedTime');
    
    // Set initial time display
    updateTimeDisplay();
    
    // Add event listener for slider
    timeSlider.addEventListener('input', updateTimeDisplay);
    
    function updateTimeDisplay() {
        commitProgress = Number(timeSlider.value);
        commitMaxTime = timeScale.invert(commitProgress);
        selectedTimeElement.textContent = commitMaxTime.toLocaleString(undefined, { 
            dateStyle: "long", 
            timeStyle: "short" 
        });
        
        filterCommitsByTime();
        updateStatsAndChart();
        displayCommitFiles(filteredCommits);
    }
}

/**
 * Filter commits by the selected time
 */
function filterCommitsByTime() {
    filteredCommits = commits.filter(commit => commit.datetime <= commitMaxTime);
}

/**
 * Update stats and chart based on filtered commits
 */
function updateStatsAndChart() {
    const commitsToDisplay = selectedCommits.length > 0 ? selectedCommits : filteredCommits;
    displayStats(commitsToDisplay);
    updateScatterplot(filteredCommits);
}

/**
 * Display summary statistics for commits
 */
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
    
    // Add average lines per commit
    const avgLinesPerCommit = Math.round(totalLOC / commitsToUse.length) || 0;
    dl.append('dt').text('Avg. Lines per Commit');
    dl.append('dd').text(avgLinesPerCommit);
}

/**
 * Update the scatter plot visualization
 */
function updateScatterplot(commitsToUse) {
    d3.select('#chart svg').remove();
    if (commitsToUse.length === 0) return;

    const svg = d3.select('#chart')
        .append('svg')
        .attr('width', width)
        .attr('height', height);

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
        .range([3, 20]);
        
    // Add title to the chart
    svg.append('text')
       .attr('x', width / 2)
       .attr('y', margin.top / 2)
       .attr('text-anchor', 'middle')
       .style('font-size', '16px')
       .style('font-weight', 'bold')
       .text('Commits by Time of Day');

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
        
    // Add axis labels
    svg.append('text')
        .attr('x', width / 2)
        .attr('y', height - 15)
        .attr('text-anchor', 'middle')
        .text('Date');
        
    svg.append('text')
        .attr('transform', 'rotate(-90)')
        .attr('x', -height/2)
        .attr('y', 15)
        .attr('text-anchor', 'middle')
        .text('Time of Day');

    // Dots
    const dotsGroup = svg.append('g').attr('class', 'dots');
    const sortedCommits = d3.sort(commitsToUse, d => -d.totalLines);

    dotsGroup.selectAll('circle')
    .data(sortedCommits)
    .join('circle')
    .attr('cx', d => xScale(d.datetime))
    .attr('cy', d => yScale(d.hourFrac))
    .attr('r', d => rScale(d.totalLines))
    .attr('fill', 'steelblue')
    .style('opacity', 0.7)
    .style('--r', d => rScale(d.totalLines))
    .classed('selected', d => selectedCommits.includes(d))
    .on('mouseenter', function(event, d) {
        d3.select(this).raise().classed('selected', true);
        showTooltip(event, d);
    })
    .on('mousemove', updateTooltipPosition)
    .on('mouseleave', function() {
        d3.select(this).classed('selected', d => selectedCommits.includes(d));
        hideTooltip();
    });

    setupBrush(svg);
}

/**
 * Set up the brush for selections on the scatter plot
 */
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

/**
 * Handle brush events to update selected commits
 */
function brushed(event) {
    const brushSelection = event.selection;
    selectedCommits = !brushSelection
        ? []
        : filteredCommits.filter((commit) => {
            let min = { x: brushSelection[0][0], y: brushSelection[0][1] };
            let max = { x: brushSelection[1][0], y: brushSelection[1][1] };
            let x = xScale(commit.datetime);
            let y = yScale(commit.hourFrac);

            return x >= min.x && x <= max.x && y >= min.y && y <= max.y;
          });
    
    updateSelection();
}

/**
 * Check if a commit is selected
 */
function isCommitSelected(commit) {
    return selectedCommits.includes(commit);
}

/**
 * Update UI elements based on selection
 */
function updateSelection() {
    d3.selectAll('#chart circle')
      .classed('selected', d => isCommitSelected(d));
    
    d3.select('#selection-count')
      .text(`${selectedCommits.length || 'No'} commits selected`);
    
    updateLanguageBreakdown(selectedCommits);
}

/**
 * Show tooltip with commit details
 */
function showTooltip(event, d) {
    const tooltip = d3.select('#commit-tooltip');
    
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

/**
 * Hide the tooltip
 */
function hideTooltip() {
    d3.select('#commit-tooltip')
        .classed('visible', false);
}

function createDailyLinesBarChart() {
    // Clear previous chart if it exists
    d3.select('#daily-lines-chart').selectAll('*').remove();
  
    // Dimensions for the chart
    const chartWidth = document.getElementById('daily-lines-chart').clientWidth || 800;
    const chartHeight = 500;
    const chartMargin = { top: 40, right: 40, bottom: 60, left: 60 };
    const chartUsableArea = {
      top: chartMargin.top,
      right: chartWidth - chartMargin.right,
      bottom: chartHeight - chartMargin.bottom,
      left: chartMargin.left,
      width: chartWidth - chartMargin.left - chartMargin.right,
      height: chartHeight - chartMargin.top - chartMargin.bottom,
    };
  
    // Group data by day
    const groupedByDay = d3.rollups(
      filteredCommits.flatMap(c => c.lines),
      v => v.length,
      d => d.datetime.toLocaleDateString()
    );
  
    // Sort by date
    groupedByDay.sort((a, b) => new Date(a[0]) - new Date(b[0]));
  
    // Convert to array of objects
    const dailyData = groupedByDay.map(([date, count]) => ({ 
      date: new Date(date), 
      count 
    }));
  
    // Skip if no data
    if (dailyData.length === 0) {
      d3.select('#daily-lines-chart')
        .append('div')
        .attr('class', 'no-data-message')
        .text('No data available for the selected time period');
      return;
    }
  
    // Create SVG
    const svg = d3.select('#daily-lines-chart')
      .append('svg')
      .attr('width', chartWidth)
      .attr('height', chartHeight);
  
    // Scales
    const xScale = d3.scaleBand()
      .domain(dailyData.map(d => d.date))
      .range([chartUsableArea.left, chartUsableArea.right])
      .padding(0.1);
  
    const yScale = d3.scaleLinear()
      .domain([0, d3.max(dailyData, d => d.count) * 1.1])
      .range([chartUsableArea.bottom, chartUsableArea.top]);
  
    // Create a color scale based on line count
    const colorScale = d3.scaleSequential()
      .domain([0, d3.max(dailyData, d => d.count)])
      .interpolator(d3.interpolateBlues);
  
    // Add title to the chart
    svg.append('text')
      .attr('x', chartWidth / 2)
      .attr('y', chartMargin.top / 2)
      .attr('text-anchor', 'middle')
      .style('font-size', '16px')
      .style('font-weight', 'bold')
      .text('Lines of Code Changed Per Day');
  
    // Gridlines
    svg.append('g')
      .attr('class', 'gridlines')
      .attr('transform', `translate(${chartUsableArea.left},0)`)
      .call(d3.axisLeft(yScale)
        .tickSize(-chartUsableArea.width)
        .tickFormat(''));
  
    // X-axis
    svg.append('g')
      .attr('transform', `translate(0,${chartUsableArea.bottom})`)
      .call(d3.axisBottom(xScale)
        .tickFormat(d => d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })))
      .selectAll('text')
      .style('text-anchor', 'end')
      .attr('dx', '-.8em')
      .attr('dy', '.15em')
      .attr('transform', 'rotate(-45)');
  
    // Y-axis
    svg.append('g')
      .attr('transform', `translate(${chartUsableArea.left},0)`)
      .call(d3.axisLeft(yScale)
        .ticks(10)
        .tickFormat(d => d3.format(',')(d)));
  
    // Add axis labels
    svg.append('text')
      .attr('x', chartWidth / 2)
      .attr('y', chartHeight - 10)
      .attr('text-anchor', 'middle')
      .text('Date');
  
    svg.append('text')
      .attr('transform', 'rotate(-90)')
      .attr('x', -chartHeight / 2)
      .attr('y', 15)
      .attr('text-anchor', 'middle')
      .text('Lines Changed');
  
    // Create bars
    const bars = svg.selectAll('.bar')
      .data(dailyData)
      .enter()
      .append('rect')
      .attr('class', 'bar')
      .attr('x', d => xScale(d.date))
      .attr('y', d => yScale(d.count))
      .attr('width', xScale.bandwidth())
      .attr('height', d => chartUsableArea.bottom - yScale(d.count))
      .attr('fill', d => colorScale(d.count))
      .attr('stroke', '#333')
      .attr('stroke-width', 0.5)
      .style('opacity', 0.9);
  
    // Add interactions
    bars.on('mouseenter', function(event, d) {
        // Highlight bar
        d3.select(this)
          .transition()
          .duration(150)
          .attr('fill', '#ff9e6d')
          .style('opacity', 1);
        
        // Show tooltip
        const tooltip = d3.select('#bar-tooltip');
        tooltip
          .html(`
            <dl>
              <dt>Date</dt>
              <dd>${d.date.toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</dd>
              <dt>Lines Changed</dt>
              <dd>${d.count.toLocaleString()}</dd>
            </dl>
          `)
          .style('left', `${event.pageX + 15}px`)
          .style('top', `${event.pageY - 30}px`)
          .classed('visible', true)
          .attr('hidden', null);
      })
      .on('mousemove', function(event) {
        // Update tooltip position
        d3.select('#bar-tooltip')
          .style('left', `${event.pageX + 15}px`)
          .style('top', `${event.pageY - 30}px`);
      })
      .on('mouseleave', function() {
        // Restore bar style
        d3.select(this)
          .transition()
          .duration(150)
          .attr('fill', d => colorScale(d.count))
          .style('opacity', 0.9);
        
        // Hide tooltip
        d3.select('#bar-tooltip')
          .classed('visible', false);
      })
      .on('click', function(event, d) {
        // Find commits from this day
        const dayStart = new Date(d.date);
        dayStart.setHours(0, 0, 0, 0);
        
        const dayEnd = new Date(d.date);
        dayEnd.setHours(23, 59, 59, 999);
        
        const dayCommits = filteredCommits.filter(commit => 
          commit.datetime >= dayStart && commit.datetime <= dayEnd
        );
        
        // Update selection to these commits
        selectedCommits = dayCommits;
        updateSelection();
        
        // Visual feedback
        d3.select(this)
          .transition()
          .duration(300)
          .attr('fill', '#ff5c33')
          .transition()
          .duration(300)
          .attr('fill', d => colorScale(d.count));
      });
  
    // Add tooltips for bars
    bars.append('title')
      .text(d => `${d.date.toLocaleDateString()}: ${d.count} lines`);
  
    // Add animated count labels on top of the bars
    svg.selectAll('.count-label')
      .data(dailyData)
      .enter()
      .append('text')
      .attr('class', 'count-label')
      .attr('x', d => xScale(d.date) + xScale.bandwidth() / 2)
      .attr('y', d => yScale(d.count) - 5)
      .attr('text-anchor', 'middle')
      .style('font-size', '10px')
      .style('font-weight', 'bold')
      .style('opacity', 0)
      .text(d => d.count)
      .transition()
      .delay((_, i) => i * 50)
      .duration(500)
      .style('opacity', d => d.count > (d3.max(dailyData, d => d.count) / 5) ? 1 : 0);
  
    // Add hover effect to show counts for smaller bars
    svg.selectAll('.bar-hover-area')
      .data(dailyData)
      .enter()
      .append('rect')
      .attr('class', 'bar-hover-area')
      .attr('x', d => xScale(d.date))
      .attr('y', d => yScale(d.count) - 20)
      .attr('width', xScale.bandwidth())
      .attr('height', d => chartUsableArea.bottom - yScale(d.count) + 20)
      .attr('fill', 'transparent')
      .on('mouseenter', function(event, d) {
        // Show count for this bar
        svg.selectAll('.count-label')
          .filter(label => label.date === d.date)
          .transition()
          .duration(200)
          .style('opacity', 1);
      })
      .on('mouseleave', function(event, d) {
        // Hide count if it's a small bar
        if (d.count <= (d3.max(dailyData, d => d.count) / 5)) {
          svg.selectAll('.count-label')
            .filter(label => label.date === d.date)
            .transition()
            .duration(200)
            .style('opacity', 0);
        }
      });
  
    // Add a horizontal average line
    const average = d3.mean(dailyData, d => d.count);
    
    svg.append('line')
      .attr('x1', chartUsableArea.left)
      .attr('x2', chartUsableArea.right)
      .attr('y1', yScale(average))
      .attr('y2', yScale(average))
      .attr('stroke', '#ff5c33')
      .attr('stroke-width', 2)
      .attr('stroke-dasharray', '5,5');
      
    svg.append('text')
      .attr('x', chartUsableArea.left + 10)
      .attr('y', yScale(average) - 5)
      .attr('fill', '#ff5c33')
      .style('font-size', '12px')
      .style('font-weight', 'bold')
      .text(`Avg: ${Math.round(average)} lines`);
  }
  
  /**
   * Update the daily lines chart when the data changes
   */
  function updateDailyLinesChart() {
    createDailyLinesBarChart();
  }
  
  /**
   * Add this to the DOM for the tooltip
   */
  function addBarChartTooltip() {
    if (!document.getElementById('bar-tooltip')) {
      const tooltip = document.createElement('dl');
      tooltip.id = 'bar-tooltip';
      tooltip.className = 'tooltip';
      tooltip.hidden = true;
      document.body.appendChild(tooltip);
    }
  }
  
  /**
   * Initialize the daily lines bar chart
   */
  function initializeDailyLinesChart() {
    // Add chart container if it doesn't exist
    if (!document.getElementById('daily-lines-chart')) {
      const chartContainer = document.createElement('div');
      chartContainer.id = 'daily-lines-chart';
      chartContainer.className = 'chart-container';
      
      // Find a suitable place to add it in your existing layout
      const mainContent = document.querySelector('main') || document.body;
      mainContent.appendChild(chartContainer);
    }
    
    // Add tooltip element
    addBarChartTooltip();
    
    // Create the chart
    createDailyLinesBarChart();
  }

/**
 * Update tooltip position during mouse movement
 */
function updateTooltipPosition(event) {
    d3.select('#commit-tooltip')
        .style('left', `${event.pageX + 15}px`)
        .style('top', `${event.pageY - 30}px`);
}

/**
 * Update the language breakdown based on selected commits
 */
function updateLanguageBreakdown(selectedCommits) {
    const commitsToUse = selectedCommits?.length ? selectedCommits : filteredCommits;
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

/**
 * Display the file size unit visualization
 */
function displayCommitFiles(commitsToUse) {
    const lines = commitsToUse.flatMap(c => c.lines);
    const fileTypeColors = d3.scaleOrdinal(d3.schemeTableau10);
    
    let files = d3.groups(lines, d => d.file)
      .map(([name, lines]) => ({ name, lines }));
    
    // Sort files by number of lines (descending)
    files = d3.sort(files, d => -d.lines.length);
    
    // Clear previous file visualization
    d3.select('.files').selectAll('div').remove();
    
    // Create file containers
    const filesContainer = d3.select('.files')
      .selectAll('div')
      .data(files)
      .enter()
      .append('div');
    
    // Add file names and line counts
    filesContainer.append('dt')
      .html(d => `<code>${d.name}</code><small>${d.lines.length} lines</small>`);
    
    // Add lines as dots with color based on file type
    filesContainer.append('dd')
      .selectAll('div')
      .data(d => d.lines)
      .enter()
      .append('div')
      .attr('class', 'line')
      .style('background', d => fileTypeColors(d.type))
      .attr('title', d => `${d.type} line from commit ${d.commit.slice(0,7)}`);
  }
/**
 * Initialize scrollytelling for commit history
 */
function initializeScrollytelling() {
    const scrollContainer = d3.select('#scroll-container');
    const spacer = d3.select('#spacer');
    
    // Set spacer height based on the number of items
    spacer.style('height', `${totalHeight}px`);
    
    // Setup scroll event
    scrollContainer.on('scroll', () => {
      const scrollTop = scrollContainer.property('scrollTop');
      let startIndex = Math.floor(scrollTop / ITEM_HEIGHT);
      startIndex = Math.max(0, Math.min(startIndex, commits.length - VISIBLE_COUNT));
      renderItems(startIndex);
    });
    
    // Initial render
    renderItems(0);
    
    // Initialize file scrollytelling
    initializeFileScrollytelling();
}

/**
 * Render items for commit history scrollytelling
 */
function renderItems(startIndex) {
    // Clear previous items
    const itemsContainer = d3.select('#items-container');
    itemsContainer.selectAll('div').remove();
    
    // Get visible slice of commits
    const endIndex = Math.min(startIndex + VISIBLE_COUNT, commits.length);
    const newCommitSlice = commits.slice(startIndex, endIndex);
    
    // Update the scrolly chart with this slice
    updateScrollyChart(newCommitSlice);
    
    // Create items with absolute positioning
    itemsContainer.selectAll('div')
        .data(newCommitSlice)
        .enter()
        .append('div')
        .attr('class', 'item')
        .html((d, i) => {
            return `
                <p>
                    On ${d.datetime.toLocaleString("en", {dateStyle: "full", timeStyle: "short"})}, I made
                    <a href="${d.url}" target="_blank">
                        ${startIndex + i > 0 ? 'another glorious commit' : 'my first commit, and it was glorious'}
                    </a>. 
                    I edited ${d.totalLines} lines across 
                    ${d3.rollups(d.lines, D => D.length, d => d.file).length} files. 
                    Then I looked over all I had made, and I saw that it was very good.
                </p>
            `;
        })
        .style('position', 'absolute')
        .style('top', (_, idx) => `${idx * ITEM_HEIGHT}px`);
}

/**
 * Update the scrolly chart based on visible commits
 */
function updateScrollyChart(commitsToUse) {
    // Dimensions for the scrolly chart
    const scrollyWidth = document.getElementById('scrolly-chart').clientWidth;
    const scrollyHeight = 500;
    const scrollyMargin = { top: 30, right: 30, bottom: 50, left: 60 };
    const scrollyUsableArea = {
        top: scrollyMargin.top,
        right: scrollyWidth - scrollyMargin.right,
        bottom: scrollyHeight - scrollyMargin.bottom,
        left: scrollyMargin.left,
        width: scrollyWidth - scrollyMargin.left - scrollyMargin.right,
        height: scrollyHeight - scrollyMargin.top - scrollyMargin.bottom,
    };

    d3.select('#scrolly-chart svg').remove();
    if (commitsToUse.length === 0) return;

    const svg = d3.select('#scrolly-chart')
        .append('svg')
        .attr('width', scrollyWidth)
        .attr('height', scrollyHeight);

    // Scales for the scrolly chart
    const scrollyXScale = d3.scaleTime()
        .domain(d3.extent(commitsToUse, d => d.datetime))
        .range([scrollyUsableArea.left, scrollyUsableArea.right])
        .nice();

    const scrollyYScale = d3.scaleLinear()
        .domain([0, 24])
        .range([scrollyUsableArea.bottom, scrollyUsableArea.top]);

    const scrollyRScale = d3.scaleSqrt()
        .domain(d3.extent(commitsToUse, d => d.totalLines))
        .range([3, 15]);
        
    // Add title
    svg.append('text')
       .attr('x', scrollyWidth / 2)
       .attr('y', scrollyMargin.top / 2)
       .attr('text-anchor', 'middle')
       .style('font-size', '14px')
       .style('font-weight', 'bold')
       .text('Commits by Time of Day');

    // Gridlines
    svg.append('g')
        .attr('class', 'gridlines')
        .attr('transform', `translate(${scrollyUsableArea.left},0)`)
        .call(d3.axisLeft(scrollyYScale)
            .tickSize(-scrollyUsableArea.width)
            .tickFormat(''));

    // Axes
    svg.append('g')
        .attr('transform', `translate(0,${scrollyUsableArea.bottom})`)
        .call(d3.axisBottom(scrollyXScale));

    svg.append('g')
        .attr('transform', `translate(${scrollyUsableArea.left},0)`)
        .call(d3.axisLeft(scrollyYScale).tickFormat(d => `${String(d % 24).padStart(2, '0')}:00`));

    // Dots
    const dotsGroup = svg.append('g').attr('class', 'dots');
    
    dotsGroup.selectAll('circle')
    .data(commitsToUse)
    .join('circle')
    .attr('cx', d => scrollyXScale(d.datetime))
    .attr('cy', d => scrollyYScale(d.hourFrac))
    .attr('r', d => scrollyRScale(d.totalLines))
    .attr('fill', 'steelblue')
    .style('opacity', 0.7)
    .style('--r', d => scrollyRScale(d.totalLines))
    .on('mouseenter', function(event, d) {
        d3.select(this).raise().classed('selected', true);
        showTooltip(event, d);
    })
    .on('mousemove', updateTooltipPosition)
    .on('mouseleave', function() {
        d3.select(this).classed('selected', false);
        hideTooltip();
    });
}

/**
 * Initialize scrollytelling for file evolution
 */
function initializeFileScrollytelling() {
    const fileScrollContainer = d3.select('#file-scroll-container');
    const fileSpacer = d3.select('#file-spacer');
    
    // Set spacer height based on the number of items
    fileSpacer.style('height', `${totalHeight}px`);
    
    // Setup scroll event
    fileScrollContainer.on('scroll', () => {
      const scrollTop = fileScrollContainer.property('scrollTop');
      let startIndex = Math.floor(scrollTop / ITEM_HEIGHT);
      startIndex = Math.max(0, Math.min(startIndex, commits.length - VISIBLE_COUNT));
      renderFileItems(startIndex);
    });
    
    // Initial render
    renderFileItems(0);
  }
  
  /**
   * Render items for file evolution scrollytelling
   */
  function renderFileItems(startIndex) {
    // Clear previous items
    const itemsContainer = d3.select('#file-items-container');
    itemsContainer.selectAll('div').remove();
    
    // Get visible slice of commits up to this point
    const endIndex = Math.min(startIndex + VISIBLE_COUNT, commits.length);
    const newCommitSlice = commits.slice(0, endIndex);
    
    // Update the file visualization
    displayCommitFiles(newCommitSlice);
    
    // Create items with absolute positioning
    itemsContainer.selectAll('div')
      .data(commits.slice(startIndex, endIndex))
      .enter()
      .append('div')
      .attr('class', 'item')
      .html((d, i) => {
        const fileChanges = d3.rollups(d.lines, D => D.length, d => d.file);
        const mostChangedFile = fileChanges.length > 0 ? 
          d3.greatest(fileChanges, ([, count]) => count) : null;
          
        const allFilesCount = new Set(newCommitSlice.flatMap(c => 
          c.lines.map(l => l.file)
        )).size;
        
        let narrative = `
          <p>
            <strong>${d.datetime.toLocaleDateString()}</strong>: This commit ${i === 0 ? 'begins' : 'continues'} 
            the evolution of our codebase.
        `;
        
        if (mostChangedFile) {
          narrative += ` The file <code>${mostChangedFile[0]}</code> saw the most changes with 
                        ${mostChangedFile[1]} lines modified.`;
        }
        
        narrative += ` At this point, the project contained 
                      ${allFilesCount} unique ${allFilesCount === 1 ? 'file' : 'files'} across all commits.`;
        
        if (i === 0 && startIndex === 0) {
          narrative += ` As you scroll down, you'll see how the codebase grows over time.`;
        }
        
        narrative += `</p>`;
        
        return narrative;
      })
      .style('position', 'absolute')
      .style('top', (_, idx) => `${idx * ITEM_HEIGHT}px`);
  }

/**
 * Display daily commits visualization 
 */
function displayDailyCommits(data, filter = "all") {
    // Clear previous visualization
    d3.select("#daily-commits-viz").html("");
    
    // Check if the target element exists
    if (d3.select("#daily-commits-viz").empty()) {
      console.warn("Could not find element with id 'daily-commits-viz'. Make sure it exists in your HTML.");
      return;
    }
    
    // Group commits by day
    const commitsByDay = d3.group(data, d => d.date.split('T')[0]);
    
    // Calculate stats for each day
    const dailyStats = Array.from(commitsByDay, ([day, commits]) => {
      const fileCount = new Set(commits.flatMap(c => c.files.map(f => f.filename))).size;
      const totalAdditions = commits.flatMap(c => c.files).reduce((sum, f) => sum + f.additions, 0);
      const totalDeletions = commits.flatMap(c => c.files).reduce((sum, f) => sum + f.deletions, 0);
      const fileTypes = new Set(commits.flatMap(c => c.files.map(f => {
        const parts = f.filename.split('.');
        return parts.length > 1 ? parts[parts.length - 1] : 'none';
      })));
      
      // Get day of week (0 = Sunday, 6 = Saturday)
      const date = new Date(day);
      const dayOfWeek = date.getDay();
      const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
      
      return {
        day,
        date,
        commitCount: commits.length,
        fileCount,
        totalAdditions,
        totalDeletions,
        fileTypes: Array.from(fileTypes),
        isWeekend
      };
    });
    
    // Sort by commit count (descending)
    dailyStats.sort((a, b) => b.commitCount - a.commitCount);
    
    // Apply filter
    let filteredStats = dailyStats;
    if (filter === "most-active") {
      filteredStats = dailyStats.slice(0, 5); // Top 5 days
    } else if (filter === "weekend-vs-weekday") {
      // Highlight weekend vs weekday
      filteredStats = dailyStats; // Keep all but will color differently
    } else if (filter === "file-types") {
      // Focus on days with diverse file types
      filteredStats = dailyStats.sort((a, b) => b.fileTypes.length - a.fileTypes.length).slice(0, 7);
    } else if (filter === "code-lines") {
      // Focus on days with most additions
      filteredStats = dailyStats.sort((a, b) => b.totalAdditions - a.totalAdditions).slice(0, 7);
    }
    
    // Set up SVG dimensions
    const width = 450;
    const height = 450;
    const margin = { top: 40, right: 30, bottom: 60, left: 60 };
    const innerWidth = width - margin.left - margin.right;
    const innerHeight = height - margin.top - margin.bottom;
    
    // Create SVG
    const svg = d3.select("#daily-commits-viz")
      .append("svg")
      .attr("width", width)
      .attr("height", height);
    
    const g = svg.append("g")
      .attr("transform", `translate(${margin.left},${margin.top})`);
    
    // Add title
    svg.append("text")
      .attr("x", width / 2)
      .attr("y", 20)
      .attr("text-anchor", "middle")
      .style("font-size", "16px")
      .style("font-weight", "bold")
      .text("Commit Activity by Day");
    
    // Different visualizations based on filter
    if (filter === "weekend-vs-weekday") {
      // Create a grouped bar chart for weekend vs weekday
      const weekdayData = { label: "Weekdays", commits: 0, files: 0, additions: 0 };
      const weekendData = { label: "Weekends", commits: 0, files: 0, additions: 0 };
      
      filteredStats.forEach(day => {
        if (day.isWeekend) {
          weekendData.commits += day.commitCount;
          weekendData.files += day.fileCount;
          weekendData.additions += day.totalAdditions;
        } else {
          weekdayData.commits += day.commitCount;
          weekdayData.files += day.fileCount;
          weekdayData.additions += day.totalAdditions;
        }
      });
      
      const comparisonData = [weekdayData, weekendData];
      
      // Normalize by dividing weekday stats by 5 (weekdays) and weekend by 2
      weekdayData.commitsPerDay = weekdayData.commits / 5;
      weekendData.commitsPerDay = weekendData.commits / 2;
      
      // X scale
      const x = d3.scaleBand()
        .domain(comparisonData.map(d => d.label))
        .range([0, innerWidth])
        .padding(0.2);
      
      // Y scale for commits
      const yCommits = d3.scaleLinear()
        .domain([0, d3.max(comparisonData, d => d.commitsPerDay) * 1.1])
        .range([innerHeight, 0]);
      
      // Create bars
      g.selectAll(".commit-bar")
        .data(comparisonData)
        .enter()
        .append("rect")
        .attr("class", "commit-bar")
        .attr("x", d => x(d.label))
        .attr("y", d => yCommits(d.commitsPerDay))
        .attr("width", x.bandwidth())
        .attr("height", d => innerHeight - yCommits(d.commitsPerDay))
        .attr("fill", d => d.label === "Weekends" ? "#ff9e6d" : "#6d9eeb")
        .append("title")
        .text(d => `${d.label}: ${d.commits} total commits\n${d.commitsPerDay.toFixed(1)} commits per day`);
      
      // Add bar labels
      g.selectAll(".bar-label")
        .data(comparisonData)
        .enter()
        .append("text")
        .attr("class", "bar-label")
        .attr("x", d => x(d.label) + x.bandwidth() / 2)
        .attr("y", d => yCommits(d.commitsPerDay) - 5)
        .attr("text-anchor", "middle")
        .text(d => d.commitsPerDay.toFixed(1));
      
      // Create axes
      g.append("g")
        .attr("transform", `translate(0,${innerHeight})`)
        .call(d3.axisBottom(x));
      
      g.append("g")
        .call(d3.axisLeft(yCommits));
      
      // Add axis labels
      g.append("text")
        .attr("x", innerWidth / 2)
        .attr("y", innerHeight + 40)
        .attr("text-anchor", "middle")
        .text("Day Type");
      
      g.append("text")
        .attr("transform", "rotate(-90)")
        .attr("x", -innerHeight / 2)
        .attr("y", -40)
        .attr("text-anchor", "middle")
        .text("Avg. Commits Per Day");
      
    } else if (filter === "file-types") {
      // Create a visualization showing file type diversity
      // Use a stacked bar chart
      
      // Get all unique file types
      const allFileTypes = new Set(filteredStats.flatMap(d => d.fileTypes));
      const fileTypesList = Array.from(allFileTypes);
      
      // Color scale for file types
      const colorScale = d3.scaleOrdinal()
        .domain(fileTypesList)
        .range(d3.schemeCategory10);
      
      // X scale (days)
      const x = d3.scaleBand()
        .domain(filteredStats.map(d => d.day))
        .range([0, innerWidth])
        .padding(0.1);
      
      // Y scale (count)
      const y = d3.scaleLinear()
        .domain([0, d3.max(filteredStats, d => d.fileTypes.length)])
        .range([innerHeight, 0]);
      
      // Create file type indicators
      filteredStats.forEach(day => {
        const barWidth = x.bandwidth();
        const segmentHeight = innerHeight / (day.fileTypes.length || 1);
        
        day.fileTypes.forEach((type, i) => {
          g.append("rect")
            .attr("x", x(day.day))
            .attr("y", innerHeight - (i + 1) * segmentHeight)
            .attr("width", barWidth)
            .attr("height", segmentHeight)
            .attr("fill", colorScale(type))
            .append("title")
            .text(`${type} files modified on ${day.day}`);
        });
        
        // Add day label
        g.append("text")
          .attr("x", x(day.day) + barWidth / 2)
          .attr("y", innerHeight + 15)
          .attr("text-anchor", "middle")
          .style("font-size", "10px")
          .text(day.day.split("-")[2]); // Just the day number
      });
      
      // Add legend
      const legend = svg.append("g")
        .attr("transform", `translate(${width - 100}, ${margin.top})`);
      
      fileTypesList.forEach((type, i) => {
        const legendRow = legend.append("g")
          .attr("transform", `translate(0, ${i * 20})`);
        
        legendRow.append("rect")
          .attr("width", 10)
          .attr("height", 10)
          .attr("fill", colorScale(type));
        
        legendRow.append("text")
          .attr("x", 15)
          .attr("y", 10)
          .attr("text-anchor", "start")
          .style("font-size", "12px")
          .text(type);
      });
      
      // Add axes
      g.append("g")
        .attr("transform", `translate(0,${innerHeight})`)
        .call(d3.axisBottom(x).tickFormat(d => d.split("-")[1] + "/" + d.split("-")[2]));
      
      g.append("g")
        .call(d3.axisLeft(y).ticks(5));
      
      // Add axis labels
      g.append("text")
        .attr("x", innerWidth / 2)
        .attr("y", innerHeight + 40)
        .attr("text-anchor", "middle")
        .text("Date");
      
      g.append("text")
        .attr("transform", "rotate(-90)")
        .attr("x", -innerHeight / 2)
        .attr("y", -40)
        .attr("text-anchor", "middle")
        .text("Number of File Types");
      
    } else if (filter === "code-lines") {
      // Bubble chart with size based on additions
      
      // Define scales
      const x = d3.scalePoint()
        .domain(filteredStats.map(d => d.day))
        .range([0, innerWidth])
        .padding(0.5);
      
      const y = d3.scaleLinear()
        .domain([0, d3.max(filteredStats, d => d.commitCount)])
        .range([innerHeight, 0]);
      
      const radius = d3.scaleSqrt()
        .domain([0, d3.max(filteredStats, d => d.totalAdditions)])
        .range([5, 40]);
      
      // Add bubbles
      g.selectAll(".addition-bubble")
        .data(filteredStats)
        .enter()
        .append("circle")
        .attr("class", "addition-bubble")
        .attr("cx", d => x(d.day))
        .attr("cy", d => y(d.commitCount))
        .attr("r", d => radius(d.totalAdditions))
        .attr("fill", "#4CAF50")
        .attr("opacity", 0.7)
        .attr("stroke", "#2E7D32")
        .attr("stroke-width", 1)
        .append("title")
        .text(d => `Date: ${d.day}\nCommits: ${d.commitCount}\nLines Added: ${d.totalAdditions}`);
      
      // Add day labels
      g.selectAll(".day-label")
        .data(filteredStats)
        .enter()
        .append("text")
        .attr("class", "day-label")
        .attr("x", d => x(d.day))
        .attr("y", innerHeight + 15)
        .attr("text-anchor", "middle")
        .style("font-size", "10px")
        .text(d => d.day.split("-").slice(1).join("/"));
      
      // Add axes
      g.append("g")
        .attr("transform", `translate(0,${innerHeight})`)
        .call(d3.axisBottom(x).tickFormat(d => ""));
      
      g.append("g")
        .call(d3.axisLeft(y));
      
      // Add axis labels
      g.append("text")
        .attr("x", innerWidth / 2)
        .attr("y", innerHeight + 40)
        .attr("text-anchor", "middle")
        .text("Date");
      
      g.append("text")
        .attr("transform", "rotate(-90)")
        .attr("x", -innerHeight / 2)
        .attr("y", -40)
        .attr("text-anchor", "middle")
        .text("Number of Commits");
      
      // Add legend for bubble size
      const legendData = [
        d3.max(filteredStats, d => d.totalAdditions) * 0.25,
        d3.max(filteredStats, d => d.totalAdditions) * 0.5, 
        d3.max(filteredStats, d => d.totalAdditions)
      ];
      
      const legendGroup = svg.append("g")
        .attr("transform", `translate(${width - 80}, ${height - 100})`);
      
      legendGroup.selectAll(".legend-bubble")
        .data(legendData)
        .enter()
        .append("circle")
        .attr("cx", 0)
        .attr("cy", (d, i) => -i * 25)
        .attr("r", d => radius(d))
        .attr("fill", "#4CAF50")
        .attr("opacity", 0.7)
        .attr("stroke", "#2E7D32")
        .attr("stroke-width", 1);
      
      legendGroup.selectAll(".legend-label")
        .data(legendData)
        .enter()
        .append("text")
        .attr("x", 45)
        .attr("y", (d, i) => -i * 25 + 5)
        .style("font-size", "12px")
        .text(d => `${d} lines`);
      
      legendGroup.append("text")
        .attr("x", 0)
        .attr("y", 30)
        .style("font-weight", "bold")
        .text("Lines Added");
      
    } else {
      // Default view: scatter plot of days with commit counts
      // X axis: chronological order
      const sortedByDate = [...filteredStats].sort((a, b) => a.date - b.date);
      
      const x = d3.scalePoint()
        .domain(sortedByDate.map(d => d.day))
        .range([0, innerWidth])
        .padding(0.5);
      
      const y = d3.scaleLinear()
        .domain([0, d3.max(filteredStats, d => d.commitCount)])
        .range([innerHeight, 0]);
      
      const radius = d3.scaleSqrt()
        .domain([0, d3.max(filteredStats, d => d.fileCount)])
        .range([5, 20]);
      
      if (filter === "most-active") {
        // Show only top days
        g.selectAll(".commit-circle")
          .data(filteredStats)
          .enter()
          .append("circle")
          .attr("class", "commit-circle")
          .attr("cx", d => x(d.day))
          .attr("cy", d => y(d.commitCount))
          .attr("r", d => radius(d.fileCount))
          .attr("fill", d => d.isWeekend ? "#ff9e6d" : "#6d9eeb")
          .attr("stroke", "#333")
          .attr("stroke-width", 1)
          .append("title")
          .text(d => `Date: ${d.day}\nCommits: ${d.commitCount}\nFiles: ${d.fileCount}`);
        
        // Add labels for top days
        g.selectAll(".day-label")
          .data(filteredStats)
          .enter()
          .append("text")
          .attr("class", "day-label")
          .attr("x", d => x(d.day))
          .attr("y", d => y(d.commitCount) - radius(d.fileCount) - 5)
          .attr("text-anchor", "middle")
          .style("font-size", "12px")
          .style("font-weight", "bold")
          .text(d => `#${filteredStats.indexOf(d) + 1}`);
        
        // Add ranking explanation
        svg.append("text")
          .attr("x", width / 2)
          .attr("y", 40)
          .attr("text-anchor", "middle")
          .style("font-size", "12px")
          .style("font-style", "italic")
          .text("Top 5 days by commit count");
      } else {
        // Show all days in chronological order
        g.selectAll(".commit-circle")
          .data(sortedByDate)
          .enter()
          .append("circle")
          .attr("class", "commit-circle")
          .attr("cx", d => x(d.day))
          .attr("cy", d => y(d.commitCount))
          .attr("r", d => radius(d.fileCount))
          .attr("fill", d => d.isWeekend ? "#ff9e6d" : "#6d9eeb")
          .attr("opacity", 0.7)
          .append("title")
          .text(d => `Date: ${d.day}\nCommits: ${d.commitCount}\nFiles: ${d.fileCount}`);
        
        // Connect points with a line to show trend
        const line = d3.line()
          .x(d => x(d.day))
          .y(d => y(d.commitCount))
          .curve(d3.curveMonotoneX);
        
        g.append("path")
          .datum(sortedByDate)
          .attr("fill", "none")
          .attr("stroke", "#999")
          .attr("stroke-width", 1)
          .attr("stroke-dasharray", "5,5")
          .attr("d", line);
      }
      
      // Add axes
      g.append("g")
        .attr("transform", `translate(0,${innerHeight})`)
        .call(d3.axisBottom(x).tickFormat(d => d.split("-").slice(1).join("/")))
        .selectAll("text")
        .style("text-anchor", "end")
        .attr("dx", "-.8em")
        .attr("dy", ".15em")
        .attr("transform", "rotate(-45)");
      
      g.append("g")
        .call(d3.axisLeft(y).ticks(5));
      
      // Add axis labels
      g.append("text")
        .attr("x", innerWidth / 2)
        .attr("y", innerHeight + 45)
        .attr("text-anchor", "middle")
        .text("Date");
      
      g.append("text")
        .attr("transform", "rotate(-90)")
        .attr("x", -innerHeight / 2)
        .attr("y", -40)
        .attr("text-anchor", "middle")
        .text("Number of Commits");
      
      // Add legend
      const legend = svg.append("g")
        .attr("transform", `translate(${width - 120}, ${margin.top})`);
      
      const legendData = [
        { label: "Weekday", color: "#6d9eeb" },
        { label: "Weekend", color: "#ff9e6d" }
      ];
      
      legendData.forEach((item, i) => {
        const legendRow = legend.append("g")
          .attr("transform", `translate(0, ${i * 20})`);
        
        legendRow.append("circle")
          .attr("r", 6)
          .attr("fill", item.color);
        
        legendRow.append("text")
          .attr("x", 15)
          .attr("y", 4)
          .text(item.label);
      });
    }
  }

  function updateAndInitAll() {
    // Update existing charts and visualizations
    updateStatsAndChart();
    
    // Initialize the daily lines bar chart
    initializeDailyLinesChart();
    
    // Initialize the files-per-day scrollytelling
    initFilesPerDayScrolly();
  }
  
  // Add this to your existing updateSelection function
  const originalUpdateSelection = updateSelection;
  updateSelection = function() {
    originalUpdateSelection();
    updateDailyLinesChart();
  };
  
  // Style for the bar chart
  const barChartStyles = `
    #daily-lines-chart {
      margin: 20px 0;
      padding: 10px;
      background-color: #fff;
      border-radius: 8px;
      box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);
    }
    
    #bar-tooltip {
      position: absolute;
      background-color: rgba(255, 255, 255, 0.9);
      border: 1px solid #ddd;
      border-radius: 4px;
      padding: 10px;
      pointer-events: none;
      font-size: 14px;
      z-index: 1000;
      opacity: 0;
      transition: opacity 0.2s;
      box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);
    }
    
    #bar-tooltip.visible {
      opacity: 1;
    }
    
    #bar-tooltip dt {
      font-weight: bold;
      margin-bottom: 2px;
    }
    
    #bar-tooltip dd {
      margin-left: 0;
      margin-bottom: 8px;
    }
    
    .bar:hover {
      cursor: pointer;
    }
    
    .bar-hover-area:hover {
      cursor: pointer;
    }
    
    .no-data-message {
      text-align: center;
      padding: 40px;
      color: #666;
      font-style: italic;
    }
  `;
  
  // Add styles to the document
  function addBarChartStyles() {
    if (!document.getElementById('bar-chart-styles')) {
      const styleEl = document.createElement('style');
      styleEl.id = 'bar-chart-styles';
      styleEl.textContent = barChartStyles;
      document.head.appendChild(styleEl);
    }
  }

  function initFilesPerDayScrolly() {
    const scrolly = d3.select(".scrolly-container.right-aligned");
    
    // Check if the element exists
    if (scrolly.empty()) {
      console.warn("Could not find the scrolly container with class 'right-aligned'");
      return;
    }
    
    const figure = scrolly.select(".scrolly-viz");
    const steps = scrolly.selectAll(".step").nodes();
    
    // Add resize event handler
    window.addEventListener('resize', () => {
      // Redraw the visualization when window is resized
      if (document.querySelector('.step.is-active')) {
        const activeStep = document.querySelector('.step.is-active').getAttribute('data-step');
        displayFilesPerDay(activeStep);
      } else {
        // Default to intro if no active step found
        displayFilesPerDay("intro");
      }
    });
    
    // Activate first step and display initial visualization
    displayFilesPerDay("intro");
    d3.select(steps[0]).classed('is-active', true);
    
    // Set up intersection observer for steps with better sensitivity
    const options = {
      root: null,
      rootMargin: "-20% 0px -20% 0px", // More sensitive top and bottom margins
      threshold: [0.3, 0.5, 0.7] // Multiple thresholds for better sensitivity
    };
    
    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        // Only update when an element enters the viewport
        if (entry.isIntersecting) {
          const stepData = d3.select(entry.target).attr("data-step");
          
          // Only update if this step isn't already active (prevents multiple firings)
          if (!d3.select(entry.target).classed('is-active')) {
            d3.selectAll('.step').classed('is-active', false);
            d3.select(entry.target).classed('is-active', true);
            displayFilesPerDay(stepData);
          }
        }
      });
    }, options);
    
    // Observe all steps
    steps.forEach(step => observer.observe(step));
  }

  /**
 * Display files per day visualization based on scroll position
 */
/**
 * Display files per day visualization based on scroll position
 */
function displayFilesPerDay(step) {
    console.log(`Updating visualization for step: ${step}`); // Debug log
    
    // Update step styles (handled by the observer now, but keep for safety)
    d3.selectAll('.step').classed('is-active', false);
    d3.selectAll(`.step[data-step="${step}"]`).classed('is-active', true);
    
    // Clear previous visualization
    d3.select("#files-per-day-viz").html("");
    
    // Set up dimensions
    const width = 600;
    const height = 500;
    const margin = { top: 60, right: 40, bottom: 120, left: 60 };
    const innerWidth = width - margin.left - margin.right;
    const innerHeight = height - margin.top - margin.bottom;
    
    // Create SVG
    const svg = d3.select("#files-per-day-viz")
      .append("svg")
      .attr("width", width)
      .attr("height", height);
    
    const g = svg.append("g")
      .attr("transform", `translate(${margin.left},${margin.top})`);
    
    // Add title
    svg.append("text")
      .attr("x", width / 2)
      .attr("y", 30)
      .attr("text-anchor", "middle")
      .style("font-size", "18px")
      .style("font-weight", "bold")
      .text("Lines Changed Per File");
    
    // Process data - group lines by file
    let allFiles = {};
    let allDates = [];
    
    // Determine how many days to show based on step
    let daysToShow = 0;
    const totalDays = d3.groups(
      filteredCommits.flatMap(c => ({ date: c.datetime.toLocaleDateString(), lines: c.lines })),
      d => d.date
    ).length;
    
    // More distinct progression between steps
    if (step === "intro") {
      daysToShow = Math.max(1, Math.ceil(totalDays * 0.15)); // First 15%
    } else if (step === "first-week") {
      daysToShow = Math.max(2, Math.ceil(totalDays * 0.35)); // 35%
    } else if (step === "mid-project") {
      daysToShow = Math.max(3, Math.ceil(totalDays * 0.60)); // 60%
    } else if (step === "late-project") {
      daysToShow = Math.max(4, Math.ceil(totalDays * 0.85)); // 85%
    } else if (step === "complete") {
      daysToShow = totalDays; // 100%
    }
    
    // Group commits by day
    const commitsByDay = d3.groups(
      filteredCommits.flatMap(c => ({ date: c.datetime.toLocaleDateString(), lines: c.lines })),
      d => d.date
    );
    
    // Sort by date
    commitsByDay.sort((a, b) => new Date(a[0]) - new Date(b[0]));
    
    // Take only the days we want to show
    const shownDays = commitsByDay.slice(0, daysToShow);
    
    // Process each day's data
    shownDays.forEach(([date, dayData]) => {
      allDates.push(date);
      
      // Group by file within this day
      const fileChanges = d3.groups(
        dayData.flatMap(d => d.lines),
        line => line.file
      );
      
      // Count lines for each file for this day
      fileChanges.forEach(([file, lines]) => {
        if (!allFiles[file]) {
          allFiles[file] = { total: 0, byDay: {} };
        }
        
        allFiles[file].byDay[date] = lines.length;
        allFiles[file].total += lines.length;
      });
    });
    
    // Convert to array format for d3
    const fileArray = Object.entries(allFiles)
      .map(([name, data]) => ({
        name,
        total: data.total,
        byDay: data.byDay
      }))
      .sort((a, b) => b.total - a.total) // Sort by total lines
      .slice(0, 15); // Show top 15 files by changes
    
    // Create scales
    const xScale = d3.scaleBand()
      .domain(fileArray.map(d => d.name))
      .range([0, innerWidth])
      .padding(0.3);
    
    const yScale = d3.scaleLinear()
      .domain([0, d3.max(fileArray, d => d.total) * 1.1])
      .range([innerHeight, 0]);
    
    // Color scale for different days
    const colorScale = d3.scaleOrdinal()
      .domain(allDates)
      .range(d3.schemeCategory10);
    
    // Create stacked data structure
    fileArray.forEach(file => {
      let stackHeight = 0;
      file.stacks = [];
      
      allDates.forEach(date => {
        if (file.byDay[date]) {
          file.stacks.push({
            date,
            height: file.byDay[date],
            y0: stackHeight,
            y1: stackHeight + file.byDay[date]
          });
          stackHeight += file.byDay[date];
        }
      });
    });
    
    // Add x axis with rotated labels
    g.append("g")
      .attr("transform", `translate(0,${innerHeight})`)
      .call(d3.axisBottom(xScale))
      .selectAll("text")
      .style("text-anchor", "end")
      .attr("dx", "-.8em")
      .attr("dy", ".15em")
      .attr("transform", "rotate(-45)");
    
    // Add y axis
    g.append("g")
      .call(d3.axisLeft(yScale));
    
    // Add axis labels
    g.append("text")
      .attr("x", innerWidth / 2)
      .attr("y", innerHeight + 80) // Positioned lower to account for rotated labels
      .attr("text-anchor", "middle")
      .text("File Name");
    
    g.append("text")
      .attr("transform", "rotate(-90)")
      .attr("x", -innerHeight / 2)
      .attr("y", -40)
      .attr("text-anchor", "middle")
      .text("Lines Changed");
    
    // Create stacked bars
    const fileGroups = g.selectAll(".file-group")
      .data(fileArray)
      .enter()
      .append("g")
      .attr("class", "file-group")
      .attr("transform", d => `translate(${xScale(d.name)},0)`);
    
    fileGroups.selectAll("rect")
      .data(d => d.stacks)
      .enter()
      .append("rect")
      .attr("width", xScale.bandwidth())
      .attr("x", 0)
      .attr("y", d => yScale(d.y1))
      .attr("height", d => yScale(d.y0) - yScale(d.y1))
      .attr("fill", d => colorScale(d.date))
      .attr("stroke", "white")
      .attr("stroke-width", 0.5)
      .append("title")
      .text(d => `${d.date}: ${d.height} lines changed`);
    
    // Add a legend
    const legendSize = 15;
    const legendSpacing = 5;
    const legendX = width - margin.right - 120;
    const legendY = margin.top;
    
    // Determine how many dates to show in the legend (to avoid overcrowding)
    let legendDates = allDates;
    if (allDates.length > 10) {
      // Show a subset of dates if there are too many
      const step = Math.ceil(allDates.length / 10);
      legendDates = allDates.filter((_, i) => i % step === 0);
    }
    
    const legend = svg.append("g")
      .attr("class", "legend")
      .attr("transform", `translate(${legendX},${legendY})`);
    
    legend.append("text")
      .attr("x", 0)
      .attr("y", -10)
      .style("font-weight", "bold")
      .text("Dates:");
    
    legend.selectAll("rect")
      .data(legendDates)
      .enter()
      .append("rect")
      .attr("x", 0)
      .attr("y", (_, i) => i * (legendSize + legendSpacing))
      .attr("width", legendSize)
      .attr("height", legendSize)
      .attr("fill", d => colorScale(d));
    
    legend.selectAll("text.legend-label")
      .data(legendDates)
      .enter()
      .append("text")
      .attr("class", "legend-label")
      .attr("x", legendSize + legendSpacing)
      .attr("y", (_, i) => i * (legendSize + legendSpacing) + legendSize / 2)
      .attr("dy", "0.35em")
      .attr("font-size", "12px")
      .text(d => {
        // Format date to be shorter
        const date = new Date(d);
        return `${date.getMonth() + 1}/${date.getDate()}`;
      });
    
    // Add progress indicator
    const progressText = svg.append("text")
      .attr("x", width / 2)
      .attr("y", height - 10)
      .attr("text-anchor", "middle")
      .style("font-style", "italic")
      .style("font-size", "14px")
      .text(`Showing ${daysToShow} out of ${totalDays} days (${Math.round(daysToShow/totalDays*100)}%)`);
  }
    
  
  // Call this after DOM is loaded
  document.addEventListener('DOMContentLoaded', function() {
    // First loading the data
    loadData().then(() => {
      // Then initialize additional charts after data is loaded
      addBarChartStyles();
      updateAndInitAll();
    });
  });
  
  // Initialize everything when the document is loaded
  document.addEventListener('DOMContentLoaded', loadData);