// DOM Elements
const fastaInput = document.getElementById('fasta-input');
const drumAudio = document.getElementById('drum-audio');
const pianoAudio = document.getElementById('piano-audio');
const playSpeedSlider = document.getElementById('play-speed');
const speedDisplay = document.getElementById('speed-display');
const analyzeBtn = document.getElementById('analyze-btn');
const clearBtn = document.getElementById('clear-btn');
const resultsContainer = document.getElementById('results-container');
const loadingSpinner = document.getElementById('loading-spinner');

// Update speed display
playSpeedSlider.addEventListener('input', (e) => {
    speedDisplay.textContent = e.target.value + 's';
});

// Clear all inputs
clearBtn.addEventListener('click', () => {
    fastaInput.value = '';
    drumAudio.value = '';
    pianoAudio.value = '';
    playSpeedSlider.value = 0.15;
    speedDisplay.textContent = '0.15s';
    resultsContainer.innerHTML = '<div class="placeholder">👈 Upload a FASTA file and click "Analyze & Generate" to begin</div>';
});

// Analyze and generate
analyzeBtn.addEventListener('click', async () => {
    if (!fastaInput.files.length) {
        alert('Please upload a FASTA file first!');
        return;
    }

    loadingSpinner.classList.remove('hidden');
    analyzeBtn.disabled = true;

    const formData = new FormData();
    formData.append('fasta_file', fastaInput.files[0]);
    formData.append('play_speed', playSpeedSlider.value);
    
    if (drumAudio.files.length) {
        formData.append('drum_audio', drumAudio.files[0]);
    }
    
    if (pianoAudio.files.length) {
        formData.append('piano_audio', pianoAudio.files[0]);
    }

    try {
        const response = await fetch('/api/analyze', {
            method: 'POST',
            body: formData
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Analysis failed');
        }

        const data = await response.json();
        displayResults(data.results);
    } catch (error) {
        alert('Error: ' + error.message);
        console.error('Error:', error);
    } finally {
        loadingSpinner.classList.add('hidden');
        analyzeBtn.disabled = false;
    }
});

// Display results
function displayResults(results) {
    resultsContainer.innerHTML = '';

    results.forEach((result, index) => {
        const card = document.createElement('div');
        card.className = 'result-card';

        const codonTypes = result.types;
        const pianoCount = codonTypes.filter(t => t === 0).length;

        const chartDiv = `chart-${index}`;
        const plotDiv = `plot-${index}`;

        card.innerHTML = `
            <h2>📊 Analysis: ${result.name}</h2>
            
            <div class="result-header">
                <div>
                    <div class="result-info">
                        <h3>Sequence Length</h3>
                        <div><span class="value">${result.sequence_length}</span><span class="unit">bp</span></div>
                    </div>
                    <div class="result-info" style="margin-top: 15px;">
                        <h3>Total Codons</h3>
                        <div><span class="value">${result.codon_count}</span></div>
                    </div>
                </div>
                <div>
                    <div class="result-info">
                        <h3>CAG Codons (Drum)</h3>
                        <div><span class="value">${result.cag_count}</span><span class="unit">(${result.cag_percentage}%)</span></div>
                    </div>
                    <div class="result-info" style="margin-top: 15px;">
                        <h3>Other Codons (Piano)</h3>
                        <div><span class="value">${pianoCount}</span><span class="unit">(${(100 - result.cag_percentage).toFixed(2)}%)</span></div>
                    </div>
                </div>
            </div>

            <div class="audio-player">
                <audio controls>
                    <source src="${result.audio}" type="audio/wav">
                    Your browser does not support the audio element.
                </audio>
                <button class="btn-download" onclick="downloadAudio('${result.name}', '${result.audio}')">⬇️ Download WAV</button>
            </div>

            <div class="chart-container">
                <h4>🎨 Codon Visualization</h4>
                <div id="${plotDiv}" style="height: 300px;"></div>
            </div>

            <div class="stats-grid">
                <div class="stat-box">
                    <div class="label">Total Codons</div>
                    <div class="number">${result.codon_count}</div>
                </div>
                <div class="stat-box">
                    <div class="label">CAG Count</div>
                    <div class="number">${result.cag_count}</div>
                </div>
                <div class="stat-box">
                    <div class="label">CAG Percentage</div>
                    <div class="number">${result.cag_percentage}%</div>
                </div>
                <div class="stat-box">
                    <div class="label">Other Codons</div>
                    <div class="number">${pianoCount}</div>
                </div>
            </div>
        `;

        resultsContainer.appendChild(card);

        // Plot codon visualization
        const xAxis = Array.from({length: result.codon_count}, (_, i) => i);
        const colors = result.types.map(t => t === 1 ? '#E74C3C' : '#2ECC71');

        Plotly.newPlot(plotDiv, [{
            x: xAxis,
            y: Array(result.codon_count).fill(1),
            type: 'bar',
            marker: { color: colors },
            customdata: result.codons,
            hovertemplate: 'Index: %{x}<br>Codon: %{customdata}<extra></extra>',
            name: 'Codon Sequence'
        }], {
            height: 300,
            margin: { l: 50, r: 30, t: 40, b: 50 },
            xaxis: { title: 'Codon Position' },
            yaxis: { visible: false },
            showlegend: false
        }, { responsive: true });
    });
}

// Download audio function
async function downloadAudio(name, audioData) {
    try {
        const response = await fetch('/api/download-audio', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                audio: audioData,
                name: name
            })
        });

        if (!response.ok) {
            throw new Error('Download failed');
        }

        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${name}_generated.wav`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
    } catch (error) {
        alert('Error downloading audio: ' + error.message);
    }
}