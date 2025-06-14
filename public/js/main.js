// js/main.js - activating saving btns
// Generic save function
async function saveSectionData(sectionName, data) {
  try {
    const response = await fetch(`/api/save-${sectionName}`, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify(data)
    });
    
    if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Save failed');
    }
    return await response.json();
} catch (error) {
    console.error(`Error saving ${sectionName}:`, error);
    throw error;
}
}


// sellect one status on the time
  document.querySelectorAll('input[name="status"]').forEach(function(checkbox) {
    checkbox.addEventListener('change', function() {
      if (this.checked) {
        // Uncheck all other checkboxes
        document.querySelectorAll('input[name="status"]').forEach(function(otherCheckbox) {
          if (otherCheckbox !== checkbox) {
            otherCheckbox.checked = false;
          }
        });
      }
    });
  });

  // sellect one Supplier on the time
  document.querySelectorAll('input[name="supplier"]').forEach(function(checkbox) {
    checkbox.addEventListener('change', function() {
      if (this.checked) {
        // Uncheck all other checkboxes in the same group
        document.querySelectorAll('input[name="supplier"]').forEach(function(otherCheckbox) {
          if (otherCheckbox !== checkbox) {
            otherCheckbox.checked = false;
          }
        });
      }
    });
  });

  // sales satatus

  document.querySelectorAll('input[name="sales-status"]').forEach(function(checkbox) {
    checkbox.addEventListener('change', function() {
      if (this.checked) {
        // Uncheck all other checkboxes in the same group
        document.querySelectorAll('input[name="sales-status"]').forEach(function(otherCheckbox) {
          if (otherCheckbox !== checkbox) {
            otherCheckbox.checked = false;
          }
        });
      }
    });
  });

      // ======================
    // Theme Management
    // ======================
    function setupThemeSwitcher() {
      const themeButton = document.getElementById('theme-btn');
      if (!themeButton) return;

      function setTheme(isDark) {
          document.body.className = isDark ? 'dark' : 'light';
          localStorage.setItem('theme', isDark ? 'dark' : 'light');
          themeButton.innerHTML = isDark ? '<i class="fas fa-sun"></i>' : '<i class="fas fa-moon"></i>';
      }

      themeButton.addEventListener('click', () => {
          const isDark = !document.body.classList.contains('dark');
          setTheme(isDark);
      });

      // Initialize theme
      const savedTheme = localStorage.getItem('theme') || 'dark';
      setTheme(savedTheme === 'dark');
  }

  function toggleCromalinFields(pressType) {
    const cromalinFields = [
        document.getElementById('aw-working-cromalin'),
        document.getElementById('aw-cromalin-qc')
    ].filter(Boolean); // Filter out null elements if any
    
    const parentElements = cromalinFields.map(field => field.closest('.checkbox-line'));
    
    if (pressType === 'Stack Type') {
        // Hide Cromalin fields for Stack Type
        parentElements.forEach(el => {
            if (el) el.style.display = 'none';
        });
    } else {
        // Show Cromalin fields for other press types
        parentElements.forEach(el => {
            if (el) el.style.display = 'flex'; // or whatever your original display was
        });
    }
}

// Call this when press type changes
document.getElementById('press-type')?.addEventListener('change', function() {
    toggleCromalinFields(this.value);
});

// Also call it when loading a job to set initial state
document.addEventListener('jobSelected', (e) => {
    if (e.detail.jobData?.press_type) {
        toggleCromalinFields(e.detail.jobData.press_type);
    }
});