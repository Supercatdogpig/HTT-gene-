// ============================================
// DOM Elements
// ============================================
const fastaInput = document.getElementById('fasta-input');
const playSpeedSlider = document.getElementById('play-speed');
const speedDisplay = document.getElementById('speed-display');
const analyzeBtn = document.getElementById('analyze-btn');
const clearBtn = document.getElementById('clear-btn');
const resultsContainer = document.getElementById('results-container');
const loadingSpinner = document.getElementById('loading-spinner');

// Web Audio API Context
let audioContext = null;

// Initialize Web Audio Context on first user interaction
document.addEventListener('click', () => {
    if (!audioContext) {
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
    }
}, { once: true });

// ============================================
// FASTA Parser
// ============================================
/**
 * Parse FASTA format text and extract DNA sequence
 * @param {string} text - FASTA file content
 * @returns {object} { name, sequence } where name is the FASTA header
 */
function parseFasta(text) {
    const lines = text.trim().split('\n');
    let name = '';
    let sequence = '';

    for (const line of lines) {
        const trimmedLine = line.trim();
        if (trimmedLine.startsWith('>')) {
            // FASTA header - extract name after '>'
            name = trimmedLine.substring(1).split(/\s+/)[0] || 'Sequence';
        } else if (trimmedLine) {
            // Sequence line - append to sequence
            // Handle both upper and lower case, remove whitespace
            sequence += trimmedLine.replace(/\s/g, '').toUpperCase();
        }
    }

    return { name, sequence };
}

// ============================================
// Codon Analysis
// ============================================
/**
 * Analyze DNA sequence and extract codons
 * @param {string} sequence - DNA sequence (uppercase)
 * @returns {object} Analysis result with statistics and codon data
 */
function analyzeSequence(name, sequence) {
    // Remove any non-ATCG characters
    const cleanSequence = sequence.replace(/[^ATCG]/gi, '').toUpperCase();
    const sequenceLength = cleanSequence.length;

    // Split into codons (3 bases each)
    const codons = [];
    const types = []; // 1 for CAG, 0 for others
    let cagCount = 0;

    for (let i = 0; i < cleanSequence.length - 2; i += 3) {
        const codon = cleanSequence.substring(i, i + 3);
        if (codon.length === 3) {
            codons.push(codon);
            if (codon === 'CAG') {
                types.push(1);
                cagCount++;
            } else {
                types.push(0);
            }
        }
    }

    const codonCount = codons.length;
    const cagPercentage = codonCount > 0 ? ((cagCount / codonCount) * 100).toFixed(2) : 0;

    return {
        name,
        sequence_length: sequenceLength,
        codon_count: codonCount,
        cag_count: cagCount,
        cag_percentage: parseFloat(cagPercentage),
        codons,
        types
    };
}

// ============================================
// Web Audio API - Sound Generation
// ============================================
/**
 * Generate audio based on codon sequence using Web Audio API
 * @param {array} types - Array of codon types (1 for CAG, 0 for others)
 * @param {number} playSpeed - Duration per codon in seconds
 * @returns {AudioBuffer} Generated audio buffer
 */
function generateAudioFromSequence(types, playSpeed) {
    if (!audioContext) {
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
    }

    // Audio parameters
    const sampleRate = audioContext.sampleRate;
    const framesToProcess = Math.ceil(sampleRate * playSpeed * types.length);
    const audioBuffer = audioContext.createBuffer(1, framesToProcess, sampleRate);
    const data = audioBuffer.getChannelData(0);

    // Frequency settings
    const drumFrequency = 800; // High frequency for CAG (drum)
    const pianoFrequency = 400; // Lower frequency for others (piano)
    const volume = 0.2; // Keep volume low to prevent clipping

    let sampleIndex = 0;

    // Generate audio for each codon
    for (let codonIndex = 0; codonIndex < types.length; codonIndex++) {
        const frequency = types[codonIndex] === 1 ? drumFrequency : pianoFrequency;
        const framesToGenerate = Math.ceil(sampleRate * playSpeed);

        // Generate sine wave for this codon
        for (let i = 0; i < framesToGenerate && sampleIndex < data.length; i++) {
            const phase = (sampleIndex * frequency * 2 * Math.PI) / sampleRate;
            // Apply envelope to avoid clicks
            const envelope = Math.min(
                1,
                Math.min(i, framesToGenerate - i) / (sampleRate * 0.01)
            );
            data[sampleIndex] = Math.sin(phase) * volume * envelope;
            sampleIndex++;
        }
    }

    return audioBuffer;
}

/**
 * Play audio buffer using Web Audio API
 * @param {AudioBuffer} audioBuffer - Audio buffer to play
 */
function playAudioBuffer(audioBuffer) {
    if (!audioContext) {
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
    }

    const source = audioContext.createBufferSource();
    const gainNode = audioContext.createGain();

    source.buffer = audioBuffer;
    source.connect(gainNode);
    gainNode.connect(audioContext.destination);

    source.start(0);
}

/**
 * Convert AudioBuffer to WAV format and return as data URL
 * @param {AudioBuffer} audioBuffer - Audio buffer to convert
 * @returns {string} Data URL for audio
 */
function audioBufferToWav(audioBuffer) {
    const length = audioBuffer.length * audioBuffer.numberOfChannels * 2 + 44;
    const arrayBuffer = new ArrayBuffer(length);
    const view = new DataView(arrayBuffer);

    // Write WAV header
    const writeString = (offset, string) => {
        for (let i = 0; i < string.length; i++) {
            view.setUint8(offset + i, string.charCodeAt(i));
        }
    };

    writeString(0, 'RIFF');
    view.setUint32(4, 36 + audioBuffer.length * 2, true);
    writeString(8, 'WAVE');
    writeString(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true); // PCM format
    view.setUint16(22, audioBuffer.numberOfChannels, true);
    view.setUint32(24, audioBuffer.sampleRate, true);
    view.setUint32(28, audioBuffer.sampleRate * 2 * audioBuffer.numberOfChannels, true);
    view.setUint16(32, audioBuffer.numberOfChannels * 2, true);
    view.setUint16(34, 16, true); // Bits per sample
    writeString(36, 'data');
    view.setUint32(40, audioBuffer.length * audioBuffer.numberOfChannels * 2, true);

    // Write audio samples
    const volume = 0.8;
    let index = 44;
    const step = 1;
    for (let i = 0; i < audioBuffer.length; i += step) {
        view.setInt16(index, audioBuffer.getChannelData(0)[i] * (0x7fff * volume), true);
        index += 2;
    }

    const blob = new Blob([arrayBuffer], { type: 'audio/wav' });
    return URL.createObjectURL(blob);
}

// ============================================
// Event Listeners
// ============================================

// Update speed display
playSpeedSlider.addEventListener('input', (e) => {
    speedDisplay.textContent = e.target.value + 's';
});

// Clear all inputs
clearBtn.addEventListener('click', () => {
    fastaInput.value = '';
    playSpeedSlider.value = 0.15;
    speedDisplay.textContent = '0.15s';
    resultsContainer.innerHTML =
        '<div class="placeholder">👈 Upload a FASTA file and click "Analyze & Generate" to begin</div>';
});

// Analyze and generate
analyzeBtn.addEventListener('click', async () => {
    if (!fastaInput.files.length) {
        alert('Please upload a FASTA file first!');
        return;
    }

    loadingSpinner.classList.remove('hidden');
    analyzeBtn.disabled = true;

    try {
        // Read file
        const file = fastaInput.files[0];
        const text = await file.text();

        // Parse FASTA
        const { name, sequence } = parseFasta(text);

        if (!sequence || sequence.length === 0) {
            throw new Error('No valid DNA sequence found in FASTA file');
        }

        // Analyze sequence
        const result = analyzeSequence(name, sequence);

        // Generate audio
        const playSpeed = parseFloat(playSpeedSlider.value);
        const audioBuffer = generateAudioFromSequence(result.types, playSpeed);
        const audioUrl = audioBufferToWav(audioBuffer);

        // Store audio reference for playback
        result.audio = audioUrl;
        result.audioBuffer = audioBuffer;

        // Display results
        displayResults([result]);
    } catch (error) {
        alert('Error: ' + error.message);
        console.error('Error:', error);
    } finally {
        loadingSpinner.classList.add('hidden');
        analyzeBtn.disabled = false;
    }
});

// ============================================
// Display Results
// ============================================
/**
 * Display analysis results with visualization and audio player
 * @param {array} results - Array of analysis result objects
 */
function displayResults(results) {
    resultsContainer.innerHTML = '';

    results.forEach((result, index) => {
        const card = document.createElement('div');
        card.className = 'result-card';

        const codonTypes = result.types;
        const pianoCount = codonTypes.filter((t) => t === 0).length;

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

        // Plot codon visualization with Plotly
        const xAxis = Array.from(
            { length: result.codon_count },
            (_, i) => i
        );
        const colors = result.types.map((t) => (t === 1 ? '#E74C3C' : '#2ECC71'));

        Plotly.newPlot(
            plotDiv,
            [
                {
                    x: xAxis,
                    y: Array(result.codon_count).fill(1),
                    type: 'bar',
                    marker: { color: colors },
                    customdata: result.codons,
                    hovertemplate:
                        'Index: %{x}<br>Codon: %{customdata}<extra></extra>',
                    name: 'Codon Sequence'
                }
            ],
            {
                height: 300,
                margin: { l: 50, r: 30, t: 40, b: 50 },
                xaxis: { title: 'Codon Position' },
                yaxis: { visible: false },
                showlegend: false
            },
            { responsive: true }
        );
    });
}

// ============================================
// Download Audio
// ============================================
/**
 * Download generated audio as WAV file
 * @param {string} name - Sequence name
 * @param {string} audioUrl - Audio data URL
 */
async function downloadAudio(name, audioUrl) {
    try {
        const response = await fetch(audioUrl);
        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${name}_generated.wav`;
        document.body.appendChild(a);
        a.click();
        URL.revokeObjectURL(url);
        document.body.removeChild(a);
    } catch (error) {
        alert('Error downloading audio: ' + error.message);
    }
}
