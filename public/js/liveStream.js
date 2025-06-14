// js/liveStream.js

// Always register this event handler at the top level, NOT inside DOMContentLoaded!
document.addEventListener('liveStreamSectionShown', function() {
    const currentUser = JSON.parse(localStorage.getItem('currentUser'));
    if (currentUser) {
        loadJobs();
        setupAutoRefresh();
    }
});

document.addEventListener('DOMContentLoaded', function() {
    // DOM Elements
    const jobStream = document.getElementById('job-stream');
    const jobSearch = document.getElementById('job-search');
    const statusFilter = document.getElementById('status-filter');

    // Douple-Click, Go Home
    jobStream.addEventListener('dblclick', function(event) {
        const jobCard = event.target.closest('.job-card');
        if (!jobCard) return;

        const currentUser = JSON.parse(localStorage.getItem('currentUser')) || {};
        const groupId = currentUser.group_id;

        const homeMap = {
            1: {section: 'files-section', button: 'btn-files'},      // Admin
            2: {section: 'aw-section', button: 'btn-aw'},            // Prepress
            3: {section: 'qc-section', button: 'btn-qc'},            // QC
            4: {section: 'planning-section', button: 'btn-planning'},// Planning
            5: {section: 'sales-section', button: 'btn-sales'},      // Sales
            8: {section: 'files-section', button: 'btn-files'},      // Maintenance
        };

        if (homeMap[groupId]) {
            showSection(homeMap[groupId].section, homeMap[groupId].button);
            showAlert('Redirected to your home section.', 'info');
        } else {
            showSection('results-section', 'btn-results');
        }
    });

    // State Management
    let refreshInterval;
    let currentScrollPosition = 0;
    let firstVisibleJobId = null;
    let isLoading = false;
    let currentFilters = {
        search: '',
        status: ''
    };

    // Make these functions globally available
    window.loadJobs = loadJobs;
    window.setupAutoRefresh = setupAutoRefresh;

    // Check if results section is already visible AND user is logged in
    const currentUser = JSON.parse(localStorage.getItem('currentUser'));
    if (document.getElementById('results-section')?.style.display === 'block' && currentUser) {
        loadJobs();
        setupAutoRefresh();
    }

    // Loads jobs when results button is clicked
    document.getElementById('btn-results')?.addEventListener('click', function() {
        loadJobs();
        setupAutoRefresh();
    });

    // Search and filter functionality
    jobSearch.addEventListener('input', debounce(function() {
        currentFilters.search = this.value.toLowerCase();
        filterJobs();
    }, 300));

    statusFilter.addEventListener('change', function() {
        currentFilters.status = this.value;
        filterJobs();
    });

    // Main job loading function
    async function loadJobs() {
        if (isLoading) return;
        isLoading = true;
        try {
            if (!document.getElementById('current-loading-indicator')) saveScrollState();
            showLoadingIndicator();
            const apiUrl = buildApiUrl();
            const jobs = await fetchJobs(apiUrl);
            processJobResponse(jobs);
        } catch (error) {
            handleLoadError(error);
        } finally {
            isLoading = false;
        }
    }

    function buildApiUrl() {
        const params = new URLSearchParams();
        if (currentFilters.search) params.append('search', currentFilters.search);
        if (currentFilters.status) params.append('status', currentFilters.status);
        return `/api/all-jobs?${params.toString()}`;
    }

    async function fetchJobs(url) {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000);
        try {
            const response = await fetch(url, { signal: controller.signal });
            clearTimeout(timeoutId);
            if (!response.ok) throw new Error('Network response was not ok');
            return await response.json();
        } catch (error) {
            clearTimeout(timeoutId);
            throw error;
        }
    }

    function processJobResponse(jobs) {
        removeLoadingIndicator();
        if (!Array.isArray(jobs) || jobs.length === 0) {
            jobStream.innerHTML = '<div class="no-jobs">No jobs found</div>';
            return;
        }
        renderJobs(jobs);
        setTimeout(restoreScrollState, 0);
    }

    function saveScrollState() {
        const firstVisibleJob = document.elementFromPoint(
            jobStream.getBoundingClientRect().left + 10,
            jobStream.getBoundingClientRect().top + 10
        )?.closest('.job-card');
        firstVisibleJobId = firstVisibleJob?.dataset.jobId || null;
        currentScrollPosition = jobStream.scrollTop;
    }

    function restoreScrollState() {
        if (firstVisibleJobId) {
            const targetJob = document.querySelector(`.job-card[data-job-id="${firstVisibleJobId}"]`);
            if (targetJob) {
                const containerTop = jobStream.getBoundingClientRect().top;
                const jobTop = targetJob.getBoundingClientRect().top;
                jobStream.scrollTop = currentScrollPosition + (jobTop - containerTop);
                return;
            }
        }
        jobStream.scrollTop = currentScrollPosition;
    }

    function renderJobs(jobs) {
        const existingJobs = new Map();
        document.querySelectorAll('.job-card').forEach(card => {
            existingJobs.set(card.dataset.jobId, card);
        });
        const sortedJobs = [...jobs].sort((a, b) =>
            new Date(b.created_date) - new Date(a.created_date)
        );
        sortedJobs.forEach(job => {
            const existingCard = existingJobs.get(job.job_number);
            if (existingCard) {
                updateJobCard(existingCard, job);
                existingJobs.delete(job.job_number);
            } else {
                const newCard = createJobCard(job);
                jobStream.insertBefore(newCard, getInsertionPoint(job, sortedJobs));
            }
        });
        existingJobs.forEach(card => card.remove());
    }

    function getInsertionPoint(job, sortedJobs) {
        const currentIndex = sortedJobs.indexOf(job);
        if (currentIndex === -1 || currentIndex === sortedJobs.length - 1) return null;
        const nextJobId = sortedJobs[currentIndex + 1].job_number;
        return document.querySelector(`.job-card[data-job-id="${nextJobId}"]`);
    }

    function createJobCard(job) {
        const jobCard = document.createElement('div');
        jobCard.className = 'job-card';
        jobCard.dataset.jobId = job.job_number;
        jobCard.dataset.jobNumber = job.job_number;
        jobCard.dataset.jobName = job.job_name;
        jobCard.dataset.customerName = job.customer_name;
        jobCard.dataset.salesman = job.salesman || 'Not specified';
        jobCard.dataset.createdDate = formatDateDisplay(job.created_date);
        jobCard.dataset.status = job.status;
        jobCard.dataset.pressType = job.press_type || '';
        jobCard.dataset.productType = job.product_type || '';
        jobCard.dataset.quantity = job.quantity || '';
        jobCard.dataset.quantityUnit = job.quantity_unit || '';

        let allowedEdit = false, allowedClone = false, allowedDelete = false;
        try {
            const currentUser = JSON.parse(localStorage.getItem('currentUser')) || {};
            const groupId = currentUser.group_id;
            allowedEdit = [1, 2, 8].includes(groupId);
            allowedClone = [1, 5, 8].includes(groupId);
            allowedDelete = [1, 8].includes(groupId);
        } catch (e) { /* fallback to no permissions */ }

        const statusOptions = getAvailableStatusOptions(job.status, currentUser?.group_id);

        jobCard.innerHTML = `
        <div class="job-card-wrapper">
          <div class="job-card-content">
            <div class="job-card-header">
              <h3>${job.job_number}: ${job.job_name}</h3>
              <div class="status-controls">
                <span class="status ${getStatusClass(job.status)}">${job.status}</span>
                ${statusOptions.length > 0 ? `
                <select class="status-dropdown" data-job-number="${job.job_number}">
                  <option value="">Change Status</option>
                  ${statusOptions.map(option => `
                    <option value="${option.value}">${option.label}</option>
                  `).join('')}
                </select>
                ` : ''}
              </div>
            </div>
            <div class="job-meta">
              <div><strong>Customer:</strong> ${job.customer_name}</div>
              <div><strong>Salesman:</strong> ${job.salesman || 'Not specified'}</div>
              <div><strong>Created:</strong> ${formatDateDisplay(job.created_date)}</div>
            </div>
          </div>
          <div class="job-actions">
            ${allowedEdit ? `<button class="edit-job-btn" data-job-number="${job.job_number}">
              <i class="fas fa-edit"></i> Edit
            </button>` : ''}
            ${allowedClone ? `<button class="clone-job-btn" data-job-number="${job.job_number}">
              <i class="fas fa-copy"></i> Clone
            </button>` : ''}
            ${allowedDelete ? `<button class="delete-job-btn" data-job-number="${job.job_number}">
              <i class="fas fa-trash-alt"></i> Delete
            </button>` : ''}
          </div>
        </div>
        `;
        return jobCard;
    }

    function getAvailableStatusOptions(currentStatus, userGroupId) {
        const statusWorkflow = {
            'Under Review': [
                { value: 'Financially Approved', groups: [5] },
                { value: 'Technically Approved', groups: [5] }
            ],
            'Financially Approved': [
                { value: 'Technically Approved', groups: [5] }
            ],
            'Technically Approved': [],
            'Working on Job-Study': [],
            'Working on softcopy': [],
            'Need SC Approval': [
                { value: 'SC Under QC Check', groups: [5] },
                { value: 'SC Checked', groups: [3] }
            ],
            'SC Under QC Check': [
                { value: 'SC Checked', groups: [3] }
            ],
            'SC Checked': [
                { value: 'Working on Cromalin', groups: [2] }
            ],
            'Working on Cromalin': [
                { value: 'Need Cromalin Approval', groups: [2] },
                { value: 'Working on Repro', groups: [2] }
            ],
            'Need Cromalin Approval': [
                { value: 'Working on Repro', groups: [2] }
            ],
            'Working on Repro': [
                { value: 'Plates are Received', groups: [2] }
            ],
            'Plates are Received': [
                { value: 'QC Received Plates', groups: [3] },
                { value: 'Plates are Ready', groups: [3] }
            ],
            'QC Received Plates': [
                { value: 'Plates are Ready', groups: [3] }
            ]
        };
        const availableOptions = statusWorkflow[currentStatus] || [];
        return availableOptions
            .filter(option => !option.groups || option.groups.includes(userGroupId))
            .map(option => ({
                value: option.value,
                label: option.value
            }));
    }

    jobStream.addEventListener('change', async function(event) {
        const statusDropdown = event.target.closest('.status-dropdown');
        if (!statusDropdown) return;

        const jobNumber = statusDropdown.dataset.jobNumber;
        const newStatus = statusDropdown.value;

        if (!newStatus) return;

        try {
            const currentUser = JSON.parse(localStorage.getItem('currentUser')) || {};

            const response = await fetch('/api/update-job-status', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    jobNumber,
                    newStatus,
                    handler_id: currentUser.id,
                    notes: 'Status changed via dropdown'
                })
            });

            const result = await response.json();
            if (!response.ok || !result.success) {
                throw new Error(result.message || 'Failed to update status');
            }

            // Update the corresponding checkbox if it exists
            const checkboxMap = {
                'Financially Approved': 'financial-approval',
                'Technically Approved': 'technical-approval',
                'SC Under QC Check': 'softcopy-approval',
                'Need SC Approval': 'aw-sc-approval', // For direct status
                'SC Checked': 'qc-sc-checked',
                'Working on Cromalin': 'aw-working-cromalin',
                'Need Cromalin Approval': 'qc-cromalin-checked',
                'Working on Repro': 'aw-working-repro',
                'Plates are Received': 'aw-plates-received',
                'QC Received Plates': 'qc-plates-received',
                'Ready for Press': 'qc-plates-checked'
            };

            if (checkboxMap[newStatus]) {
                const checkbox = document.getElementById(checkboxMap[newStatus]);
                if (checkbox) {
                    checkbox.checked = true;
                    // For "Need SC Approval", also trigger the handler to ensure DB is updated
                    if (newStatus === 'Need SC Approval') {
                        const event = new Event('change', { bubbles: true });
                        checkbox.dispatchEvent(event);
                    }
                }
            }

            loadJobs();
            showNotification(`Status updated to ${newStatus}`, 'success');
        } catch (error) {
            console.error('Status update error:', error);
            showNotification(error.message || 'Failed to update status', 'error');
        } finally {
            statusDropdown.value = '';
        }
    });

    function updateJobCard(card, job) {
        const header = card.querySelector('.job-card-header h3');
        const status = card.querySelector('.status');
        const meta = card.querySelector('.job-meta');
        const newHeaderText = `${job.job_number}: ${job.job_name}`;
        if (header.textContent !== newHeaderText) header.textContent = newHeaderText;
        const newStatusText = job.status;
        if (status.textContent !== newStatusText) {
            status.textContent = newStatusText;
            status.className = `status ${getStatusClass(job.status)}`;
        }
        const newMetaHTML = `
            <div><strong>Customer:</strong> ${job.customer_name}</div>
            <div><strong>Salesman:</strong> ${job.salesman || 'Not specified'}</div>
            <div><strong>Created:</strong> ${formatDateDisplay(job.created_date)}</div>
        `;
        if (meta.innerHTML !== newMetaHTML) meta.innerHTML = newMetaHTML;
    }

    function formatDateDisplay(dateString) {
        if (/^\d{1,2}-[A-Za-z]{3}-\d{4} \d{2}:\d{2}:\d{2}$/.test(dateString)) return dateString;
        const date = new Date(dateString);
        if (isNaN(date)) return dateString;
        const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
            'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        const day = date.getDate();
        const month = months[date.getMonth()];
        const year = date.getFullYear();
        const hours = String(date.getHours()).padStart(2, '0');
        const minutes = String(date.getMinutes()).padStart(2, '0');
        const seconds = String(date.getSeconds()).padStart(2, '0');
        return `${day}-${month}-${year} ${hours}:${minutes}:${seconds}`;
    }

    function getStatusClass(status) {
        const statusMap = {
            'Financially Approved': 'status-finance',
            'Technically Approved': 'status-tech',
            'Working on Job-Study': 'status-ready',
            'Working on softcopy': 'status-ready',
            'Need SC Approval': 'status-prepress',
            'SC Under QC Check': 'status-qc',
            'Working on Cromalin': 'status-prepress',
            'Cromalin Under QC Check': 'status-qc',
            'Need Cromalin Approval': 'status-prepress',
            'Working on Repro': 'status-prepress',
            'Prepress Received Plates': 'status-prepress', // Add this line
            'QC Received Plates': 'status-qc', // Add this line
            'Ready for Press': 'status-ready',
            'On Hold Since': 'status-hold',
            'default': 'status-review'
        };
        for (const [key, value] of Object.entries(statusMap)) {
            if (status.includes(key)) return value;
        }
        return statusMap.default;
    }

    function filterJobs() {
        const searchTerm = currentFilters.search;
        const statusValue = currentFilters.status;
        const jobCards = document.querySelectorAll('.job-card');
        let hasVisibleJobs = false;
        jobCards.forEach(card => {
            const jobNumberText = card.querySelector('.job-card-header h3').textContent.toLowerCase();
            const customerText = card.querySelector('.job-meta div:nth-child(1)').textContent.toLowerCase();
            const salesmanText = card.querySelector('.job-meta div:nth-child(2)').textContent.toLowerCase();
            const statusElement = card.querySelector('.status');
            const status = statusElement ? statusElement.textContent : '';
            const matchesSearch = searchTerm === '' ||
                jobNumberText.includes(searchTerm) ||
                customerText.includes(searchTerm) ||
                salesmanText.includes(searchTerm);
            const matchesStatus = statusValue === '' || status === statusValue;
            if (matchesSearch && matchesStatus) {
                card.style.display = 'block';
                hasVisibleJobs = true;
            } else {
                card.style.display = 'none';
            }
        });
        toggleNoResultsMessage(hasVisibleJobs);
        debouncedServerRefresh();
    }

    const debouncedServerRefresh = debounce(() => {
        saveScrollState();
        loadJobs();
    }, 500);

    function toggleNoResultsMessage(hasVisibleJobs) {
        const noResultsMsg = document.getElementById('no-results-message');
        if (!hasVisibleJobs) {
            if (!noResultsMsg) {
                const msg = document.createElement('div');
                msg.id = 'no-results-message';
                msg.className = 'no-jobs';
                msg.textContent = 'No jobs match your filters';
                jobStream.appendChild(msg);
            }
        } else if (noResultsMsg) {
            noResultsMsg.remove();
        }
    }

    function setupAutoRefresh() {
        clearInterval(refreshInterval);
        refreshInterval = setInterval(loadJobs, 15000);
    }

    function showLoadingIndicator() {
        removeLoadingIndicator();
        const loader = document.createElement('div');
        loader.id = 'current-loading-indicator';
        loader.className = 'loading-indicator';
        loader.textContent = 'Loading updates...';
        jobStream.insertBefore(loader, jobStream.firstChild);
    }

    function removeLoadingIndicator() {
        const loader = document.getElementById('current-loading-indicator');
        if (loader) loader.remove();
    }

    function handleLoadError(error) {
        removeLoadingIndicator();
        if (error.name === 'AbortError') {
            showNotification('Request timed out. Please check your connection.', 'error');
        } else {
            showNotification(`Server Disconnected: ${error.message}`, 'error');
        }
    }

    function showNotification(message, type = 'info') {
        const container = document.getElementById('notification-container') || createNotificationContainer();
        const notification = document.createElement('div');
        notification.className = `notification ${type}`;
        notification.textContent = message;
        container.appendChild(notification);
        setTimeout(() => notification.classList.add('show'), 10);
        setTimeout(() => {
            notification.classList.remove('show');
            setTimeout(() => notification.remove(), 300);
        }, 5000);
    }

    function createNotificationContainer() {
        const container = document.createElement('div');
        container.id = 'notification-container';
        container.className = 'notification-container';
        document.body.appendChild(container);
        return container;
    }

    function debounce(func, wait) {
        let timeout;
        return function() {
            const context = this, args = arguments;
            clearTimeout(timeout);
            timeout = setTimeout(() => func.apply(context, args), wait);
        };
    }

    async function loadDepartmentData(jobNumber) {
        if (!jobNumber) return;
        try {
            const salesResponse = await fetch(`/api/jobs/${jobNumber}`);
            const salesData = await salesResponse.json();
            if (salesResponse.ok && salesData.success) {
                populateSalesForm(salesData.data);
            }
            const planningResponse = await fetch(`/api/planning-data/${jobNumber}`);
            const planningData = await planningResponse.json();
            if (planningResponse.ok && planningData.success) {
                if (!planningData.data.product_type && salesData.data) {
                    planningData.data.product_type = salesData.data.product_type;
                }
                populatePlanningForm(planningData.data);
            }
            const prepressResponse = await fetch(`/api/prepress-data/${jobNumber}`);
            const prepressData = await prepressResponse.json();
            if (prepressResponse.ok && prepressData.success) {
                populatePrepressForm(prepressData.data);
            }
            const qcResponse = await fetch(`/api/qc-data/${jobNumber}`);
            const qcData = await qcResponse.json();
            if (qcResponse.ok && qcData.success) {
                populateQCForm(qcData.data);
            }
        } catch (error) {
            console.error('Error loading department data:', error);
        }
    }

    function updatePlanningOptionsVisibility(productType) {
        if (!productType) {
            document.getElementById('planning-bag-options').style.display = 'none';
            return;
        }
        const flipOption = document.getElementById('flip-direction-option');
        const linesOption = document.getElementById('add-lines-option');
        const machineOption = document.getElementById('new-machine-option');
        const staggerOption = document.getElementById('add-stagger-option');
        const bagOptionsContainer = document.getElementById('planning-bag-options');
        bagOptionsContainer.style.display = 'block';
        const productTypeLower = productType.toLowerCase();
        flipOption.style.display = productTypeLower.includes('3 side') ? 'block' : 'none';
        linesOption.style.display = productTypeLower.includes('t-shirt') ? 'none' : 'block';
        machineOption.style.display = productTypeLower.includes('flat bottom') ? 'block' : 'none';
        staggerOption.style.display = productTypeLower.includes('t-shirt') ? 'none' : 'block';
    }

    function populateQCForm(data) {
        if (!data) return;
        document.getElementById('qc-sc-checked').checked = Boolean(data.sc_checked);
        document.getElementById('qc-sc-checked').disabled = platesReady; // Disable if plates are ready
        document.getElementById('qc-cromalin-checked').checked = Boolean(data.cromalin_checked);
        document.getElementById('qc-plates-received').checked = Boolean(data.plates_received);
        document.getElementById('qc-plates-checked').checked = Boolean(data.plates_checked);
        document.getElementById('qc-comments').innerText = data.comments || '';
    }

    function addColorField(name = '', code = '') {
        const colorContainer = document.getElementById('color-fields-container');
        const colorField = document.createElement('div');
        colorField.className = 'color-field';
        colorField.innerHTML = `
            <input type="text" class="color-name-input" placeholder="Color Name" value="${name}">
            <input type="color" class="color-code-input" value="${code || '#ffffff'}">
            <button type="button" class="remove-color-btn">×</button>
        `;
        colorContainer.appendChild(colorField);
        colorField.querySelector('.remove-color-btn').addEventListener('click', () => colorField.remove());
    }


//========================
function showQuickPeek(jobData) {
    const quickPeekContainer = document.getElementById('quick-peek-container');
    const quickPeekContent = document.getElementById('quick-peek-content');
    const surroundingContainer = document.querySelector('.surrounding-elements');
    
    if (!quickPeekContainer || !quickPeekContent) return;

    // Store current data and create update function
    quickPeekContainer.currentData = {...jobData};
    quickPeekContainer.updateContent = function() {
        quickPeekContent.innerHTML = `
            <div class="quick-peek-inner">
                <h4>${this.currentData.job_number} - ${this.currentData.job_name}</h4>
                <div class="quick-peek-meta">
                    <p><strong>Created:</strong> ${this.currentData.created_date}</p>
                    <p><strong>Customer:</strong> ${this.currentData.customer_name}</p>
                    <p><strong>Salesman:</strong> ${this.currentData.salesman}</p>
                    <p><strong>Handler:</strong> ${this.currentData.handler || 'Not Assigned'}</p>
                    <p><strong>Product Type:</strong> ${this.currentData.product_type}</p>
                    <p><strong>Press Type:</strong> ${this.currentData.press_type}</p>
                    <p class="quick-peek-status">
                        <span class="status ${getStatusClass(this.currentData.status)}">
                            ${this.currentData.status}
                        </span>
                    </p>
                </div>
                ${this.currentData.sc_image_url ? `
                <div class="quick-peek-image">
                    <p class="quick-peek-image-label">SC Approval Image:</p>
                    <img src="${this.currentData.sc_image_url}" alt="SC Approval">
                </div>
                ` : '<p class="quick-peek-no-image">No SC approval image available</p>'}
            </div>
        `;
    };

    // Initial render
    quickPeekContainer.updateContent();

    // Status update listener
    const statusListener = (e) => {
        if (e.detail.jobNumber === quickPeekContainer.currentData.job_number) {
            // Add animation class for status change
            quickPeekContent.classList.add('quick-peek-updating');
            
            // Update data and content
            quickPeekContainer.currentData.status = e.detail.newStatus;
            quickPeekContainer.updateContent();
            
            // Remove animation class after transition
            setTimeout(() => {
                quickPeekContent.classList.remove('quick-peek-updating');
            }, 300);
        }
    };

    document.addEventListener('statusChanged', statusListener);

    // Close handler
    document.getElementById('close-quick-peek').addEventListener('click', () => {
        document.removeEventListener('statusChanged', statusListener);
        quickPeekContainer.classList.remove('quick-peek-visible');
        
        // Push surrounding content back up
        if (surroundingContainer) {
            surroundingContainer.classList.remove('push-down-container');
        }
        
        // After animation completes, hide container
        setTimeout(() => {
            quickPeekContainer.style.display = 'none';
        }, 300);
    });

    // Animation setup
    quickPeekContainer.style.display = 'block';
    
    // Calculate height after content renders
    requestAnimationFrame(() => {
        const height = quickPeekContainer.scrollHeight;
        quickPeekContainer.style.setProperty('--quick-peek-height', `${height}px`);
        
        // Trigger animations
        quickPeekContainer.classList.add('quick-peek-visible');
        if (surroundingContainer) {
            surroundingContainer.classList.add('push-down-container');
        }
    });



    
    // Cleanup on close
    document.getElementById('close-quick-peek').addEventListener('click', () => {
        document.removeEventListener('statusChanged', statusListener);
        quickPeekContainer.classList.remove('quick-peek-visible');
        setTimeout(() => {
            quickPeekContainer.style.display = 'none';
        }, 300);
    });

    // Show with animation
    quickPeekContainer.style.display = 'block';
    setTimeout(() => {
        quickPeekContainer.classList.add('quick-peek-visible');
    }, 10);
}

// Helper function to format dates
function formatDateDisplay(dateString) {
    if (!dateString || dateString === 'N/A') return 'N/A';
    try {
        if (/^\d{1,2}-[A-Za-z]{3}-\d{4}/.test(dateString)) return dateString;
        const date = new Date(dateString);
        return isNaN(date) ? dateString : date.toLocaleString();
    } catch (e) {
        return dateString;
    }
}
// Then update the job card click event handler to use quick peek instead of job details:
jobStream.addEventListener('click', async function(event) {
    // First check if it's an action button
    const editBtn = event.target.closest('.edit-job-btn');
    const cloneBtn = event.target.closest('.clone-job-btn');
    const deleteBtn = event.target.closest('.delete-job-btn');
    
    if (editBtn) {
        event.stopPropagation();
        return handleEditJob(editBtn.dataset.jobNumber);
    } else if (cloneBtn) {
        event.stopPropagation();
        return handleCloneJob(cloneBtn.dataset.jobNumber);
    } else if (deleteBtn) {
        event.stopPropagation();
        return handleDeleteJob(deleteBtn.dataset.jobNumber, deleteBtn);
    }
    
    // Handle job card click
    const jobCard = event.target.closest('.job-card');
    if (jobCard && !event.target.closest('.job-actions')) {
        document.querySelectorAll('.job-card').forEach(card => card.classList.remove('selected'));
        jobCard.classList.add('selected');

        const jobNumber = jobCard.dataset.jobId;
        const jobSelectedEvent = new CustomEvent('jobSelected', { detail: { jobNumber } });
        document.dispatchEvent(jobSelectedEvent);

        // Create complete job data object from card attributes FIRST
        const cardData = {
            job_number: jobCard.dataset.jobId,
            job_name: jobCard.dataset.jobName,
            customer_name: jobCard.dataset.customerName,
            salesman: jobCard.dataset.salesman,
            Handler: jobCard.handler_name,
            product_type: jobCard.dataset.productType,
            press_type: jobCard.dataset.pressType,
            status: jobCard.dataset.status,
            created_date: jobCard.dataset.createdDate,
            _source: 'card'
        };

        // Show quick peek immediately with CARD data
        showQuickPeek(cardData);

        // Then try to fetch more detailed data
        try {
            // Fetch both job data and prepress data
            const [jobResponse, prepressResponse] = await Promise.all([
                fetch(`/api/jobs/${jobNumber}`),
                fetch(`/api/prepress-data/${jobNumber}`)
            ]);

            if (!jobResponse.ok) throw new Error('Failed to fetch job details');
            if (!prepressResponse.ok) throw new Error('Failed to fetch prepress details');

            const jobResult = await jobResponse.json();
            const prepressResult = await prepressResponse.json();

            if (jobResult.success && jobResult.data && prepressResult.success) {
                // MERGE all data
                const mergedData = {
                    ...cardData,
                    ...jobResult.data,
                    ...prepressResult.data, // This includes sc_image_url
                    status: jobResult.data.status || cardData.status,
                    created_date: jobResult.data.created_date || cardData.created_date,
                    _source: 'api'
                };
                
                // Update quick peek with the MERGED data (which now includes image URL)
                showQuickPeek(mergedData);
                populateSalesForm(mergedData);
            }
        } catch (error) {
            console.error('Error loading job details:', error);
            // Keep showing the card data we already displayed
        }

        populateSearchFiltersFromJob(jobCard);
    }
});

// Also update the close button handler to hide quick peek
const closeButton = event.target.closest('#close-job-details');
if (closeButton) {
    hideQuickPeek();
    document.querySelectorAll('.job-card').forEach(card => card.classList.remove('selected'));
}

//=======================

async function handleEditJob(jobNumber) {
    try {
        const editBtn = document.querySelector(`.edit-job-btn[data-job-number="${jobNumber}"]`);
        if (editBtn) {
            editBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Loading...';
            editBtn.disabled = true;
        }
        const response = await fetch(`/api/jobs/${encodeURIComponent(jobNumber)}`);
        if (!response.ok) throw new Error('Failed to fetch job details');
        const result = await response.json();
        if (!result.success || !result.data) throw new Error(result.message || 'Invalid job data received');

        // --------- NEW LOGIC HERE ---------
        const currentUser = JSON.parse(localStorage.getItem('currentUser')) || {};
        const groupId = currentUser.group_id;

        if (groupId === 2) {
            // Prepress user: show prepress form
            showSection('aw-section', 'btn-aw');
            populatePrepressForm(result.data); // Make sure this function exists and does what you want
        } else {
            // Default: show sales form
            showSection('sales-section', 'btn-sales');
            populateSalesForm(result.data);
        }
        // --------- END NEW LOGIC ---------

        await loadDepartmentData(jobNumber);
        showAlert('Job loaded for editing', 'success');
    } catch (error) {
        console.error('Edit job failed:', error);
        showAlert(error.message || 'Failed to load job for editing', 'error');
    } finally {
        const editBtn = document.querySelector(`.edit-job-btn[data-job-number="${jobNumber}"]`);
        if (editBtn) {
            editBtn.innerHTML = '<i class="fas fa-edit"></i> Edit';
            editBtn.disabled = false;
        }
    }
}

    async function handleCloneJob(jobNumber) {
        try {
            const cloneBtn = document.querySelector(`.clone-job-btn[data-job-number="${jobNumber}"]`);
            if (cloneBtn) {
                cloneBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Loading...';
                cloneBtn.disabled = true;
            }
            const response = await fetch(`/api/jobs/${encodeURIComponent(jobNumber)}`);
            if (!response.ok) throw new Error('Failed to fetch job details');
            const result = await response.json();
            if (!result.success || !result.data) throw new Error(result.message || 'Invalid job data received');
            showSection('sales-section', 'btn-sales');
            const jobData = {
                ...result.data,
                job_number: '',
                entry_date: new Date().toISOString().split('T')[0]
            };
            populateSalesForm(jobData);
    
            // ----------- THIS IS THE NEW PART -----------
            // Write "cloned from the job ..." in the comment box
            const commentsBox = document.getElementById('comments');
            if (commentsBox) {
                const oldJobId = result.data.job_number || jobNumber;
                const oldJobName = result.data.job_name || '';
                commentsBox.innerText = `Cloned from the job ${oldJobId} ${oldJobName}`;
            }
            // ----------- END NEW PART -------------------
    
            showAlert('Job data loaded for cloning - remember to save as new job', 'success');
        } catch (error) {
            console.error('Clone job failed:', error);
            showAlert(error.message || 'Failed to load job for cloning', 'error');
        } finally {
            const cloneBtn = document.querySelector(`.clone-job-btn[data-job-number="${jobNumber}"]`);
            if (cloneBtn) {
                cloneBtn.innerHTML = '<i class="fas fa-copy"></i> Clone';
                cloneBtn.disabled = false;
            }
        }
    }

    async function handleDeleteJob(jobNumber, btn) {
        if (!btn) return;
        if (!confirm(`Are you sure you want to delete job ${jobNumber}?`)) return;
        const jobCard = btn.closest('.job-card');
        if (!jobCard) return;
        try {
            btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Deleting...';
            btn.disabled = true;
            jobCard.classList.add('deleting');
            await new Promise(resolve => setTimeout(resolve, 300));
            jobCard.remove();
            const response = await fetch(`/api/jobs/${encodeURIComponent(jobNumber)}`, {
                method: 'DELETE'
            });
            const result = await response.json();
            if (!response.ok || !result.success) throw new Error(result.message || 'Delete failed');
            showAlert(`Job ${jobNumber} deleted successfully`, 'success');
        } catch (error) {
            console.error('Delete failed:', error);
            if (jobStream && jobCard && !document.body.contains(jobCard)) {
                jobStream.insertBefore(jobCard, jobStream.firstChild);
                jobCard.classList.remove('deleting');
            }
            if (btn && document.body.contains(btn)) {
                btn.innerHTML = '<i class="fas fa-trash-alt"></i> Delete';
                btn.disabled = false;
            }
            if (error.message !== "Job not found") {
                showAlert(error.message || 'Failed to delete job', 'error');
            }
        }
    }

    function populateSearchFiltersFromJob(jobCard) {
        const pressType = jobCard.dataset.pressType;
        const productType = jobCard.dataset.productType;
        const status = jobCard.dataset.status;
        if (pressType) {
            const printingTypeSelect = document.getElementById('printing-type');
            if (printingTypeSelect) {
                printingTypeSelect.value = pressType.toLowerCase().includes('stack') ? 'stack' : 'central';
            }
        }
        if (productType) {
            const productSelect = document.getElementById('product');
            if (productSelect) {
                const productValue = mapProductTypeToValue(productType);
                productSelect.value = productValue;
            }
        }
        if (status) {
            const statusSelect = document.getElementById('status-filter');
            if (statusSelect) statusSelect.value = status;
        }
    }

    function mapProductTypeToValue(productType) {
        const mapping = {
            'Center Seal': 'center-seal',
            '2 Side': '2-side',
            '3 Side': '3-side',
            '3 Side K': '3-side-k',
            '3 Side Stand Up': '3-side-stand-up',
            '4 Side': '4-side',
            'Normal Bag': 'normal-bag',
            'Chicken Bag': 'chicken-bag',
            'Flat Bottom': 'flat-bottom',
            'Shopping Bag': 'shopping-bag',
            'Roll': 'roll'
        };
        return mapping[productType] || '';
    }

    function showSection(sectionId, btnId) {
        document.querySelectorAll('.form-section').forEach(section => {
            section.style.display = 'none';
        });
        document.getElementById(sectionId).style.display = 'block';
        
        document.querySelectorAll('.button-container button').forEach(button => {
            button.classList.toggle('pressed', button.id === btnId);
        });
        
        // If showing results section, ensure job stream is visible
        if (sectionId === 'results-section') {
            document.getElementById('job-stream-container').style.display = 'block';
        }
    }
    // Event delegation for job action buttons
    jobStream.addEventListener('click', function(event) {
        const editBtn = event.target.closest('.edit-job-btn');
        const cloneBtn = event.target.closest('.clone-job-btn');
        const deleteBtn = event.target.closest('.delete-job-btn');
        
        if (editBtn) {
            event.preventDefault();
            const jobNumber = editBtn.dataset.jobNumber;
            handleEditJob(jobNumber);
        } else if (cloneBtn) {
            event.preventDefault();
            const jobNumber = cloneBtn.dataset.jobNumber;
            handleCloneJob(jobNumber);
        } else if (deleteBtn) {
            event.preventDefault();
            const jobNumber = deleteBtn.dataset.jobNumber;
            handleDeleteJob(jobNumber, deleteBtn);
        }
    });
});