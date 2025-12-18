// Cultural Events App - Main JavaScript

// Global variables
let currentUser = null;
let map = null;
let markers = [];
let venues = [];
let currentVenue = null;
let userLocation = null;
let sortOrder = { field: 'name', ascending: true };

// Initialize app
document.addEventListener('DOMContentLoaded', function() {
    initializeTheme();
    checkAuthStatus();
    setupEventListeners();
    loadAndRenderLastUpdated();
});

function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    
    let icon = 'info-circle';
    if (type === 'success') icon = 'check-circle';
    if (type === 'error') icon = 'exclamation-circle';
    
    toast.innerHTML = `<i class="fas fa-${icon}"></i> <span>${message}</span>`;
    
    container.appendChild(toast);
    
    // Remove from DOM after animation
    setTimeout(() => {
        toast.remove();
    }, 3000);
}

// Theme Management
function initializeTheme() {
    const savedTheme = localStorage.getItem('theme') || 'light';
    document.documentElement.setAttribute('data-theme', savedTheme);
    updateThemeIcon(savedTheme);
}

function toggleTheme() {
    const currentTheme = document.documentElement.getAttribute('data-theme');
    const newTheme = currentTheme === 'light' ? 'dark' : 'light';
    
    document.documentElement.setAttribute('data-theme', newTheme);
    localStorage.setItem('theme', newTheme);
    updateThemeIcon(newTheme);
}

function updateThemeIcon(theme) {
    const icon = document.querySelector('#themeToggle i');
    icon.className = theme === 'light' ? 'fas fa-moon' : 'fas fa-sun';
}

// Authentication
function checkAuthStatus() {
    fetch('/api/session')
        .then(response => response.json())
        .then(data => {
            if (data.loggedIn) {
                currentUser = data;
                showUserInterface(data);
            } else {
                showPage('login');
            }
        })
        .catch(error => console.error('Error checking auth status:', error));
}

function showUserInterface(userData) {
    currentUser = userData;

    document.getElementById('loginLink')?.classList.add('hidden');
    document.getElementById('venuesLink')?.classList.remove('hidden');
    document.getElementById('mapLink')?.classList.remove('hidden');
    document.getElementById('favoritesLink')?.classList.remove('hidden');
    if (userData.isAdmin) document.getElementById('adminLink')?.classList.remove('hidden');

    // Hide the standalone theme toggle (we add it inside the user menu)
    document.getElementById('themeToggle')?.classList.add('hidden');

    // Build avatar + dropdown menu in the userInfo slot
    const userInfo = document.getElementById('userInfo');
    const initial = (userData.username || '?').charAt(0).toUpperCase();
    userInfo.classList.remove('hidden');
    userInfo.innerHTML = `
      <div class="user-avatar" id="userAvatar" title="${userData.username}">${initial}</div>
      <div class="user-menu hidden" id="userMenu">
        <div class="user-menu-header">
          <i class="fas fa-user-circle"></i>
          <span id="userMenuName">${userData.username}</span>
        </div>
        <div class="user-menu-actions">
          ${userData.isAdmin ? `<button type="button" class="menu-item" id="menuAdminBtn"><i class="fas fa-tools"></i> Admin Panel</button>` : ''}
          <button type="button" class="menu-item" id="menuThemeBtn"><i class="fas fa-adjust"></i> Toggle Theme</button>
          <button type="button" class="menu-item" id="menuLogoutBtn"><i class="fas fa-sign-out-alt"></i> Logout</button>
        </div>
      </div>
    `;

    // Always hide Admin nav link (Admin Panel is in the profile menu)
    const adminNav = document.getElementById('adminLink');
    if (adminNav) adminNav.classList.add('hidden');

    // Toggle menu
    const avatarEl = document.getElementById('userAvatar');
    const menuEl = document.getElementById('userMenu');
    avatarEl?.addEventListener('click', (e) => {
      e.stopPropagation();
      menuEl?.classList.toggle('hidden');
    });
    // Close on outside click
    document.addEventListener('click', () => menuEl?.classList.add('hidden'));

    // Menu actions
    document.getElementById('menuThemeBtn')?.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleTheme();
      menuEl?.classList.add('hidden');
    });
    document.getElementById('menuLogoutBtn')?.addEventListener('click', (e) => {
      e.stopPropagation();
      menuEl?.classList.add('hidden');
      logout();
    });
    document.getElementById('menuAdminBtn')?.addEventListener('click', (e) => {
      e.stopPropagation();
      menuEl?.classList.add('hidden');
      showPage('admin');
    });

    // Hide login page
    const loginPage = document.getElementById('loginPage');
    if (loginPage) {
        loginPage.classList.remove('active');
        loginPage.classList.add('hidden');
        loginPage.style.display = 'none';
    }

    const target = (location.hash && location.hash.substring(1)) || 'venues';
    showPage(target);
}

function setupEventListeners() {
    // Login form
    document.getElementById('loginForm').addEventListener('submit', function(e) {
        e.preventDefault();
        login();
    });

    // Existing filters...
    document.getElementById('venueSearch').addEventListener('input', filterVenues);
    document.getElementById('areaFilter').addEventListener('change', filterVenues);
    document.getElementById('distanceFilter').addEventListener('input', filterVenues);

}

// Ensure login() hides the form after success
function login() {
    const username = document.getElementById('loginUsername').value;
    const password = document.getElementById('password').value;
    const errorDiv = document.getElementById('loginError');
    
    fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
    })
    .then(response => response.json())
    .then(data => {
        if (data.message) {
            // Build UI and hide login
            showUserInterface(data.user);

            // Force navigation to Venues (ignore existing hash)
            showPage('venues');
            updateHistory('venues');

            errorDiv.classList.add('hidden');
        } else {
            errorDiv.textContent = data.error || 'Login failed';
            errorDiv.classList.remove('hidden');
        }
    })
    .catch(error => {
        console.error('Login error:', error);
        errorDiv.textContent = 'Login failed. Please try again.';
        errorDiv.classList.remove('hidden');
    });
}

function logout() {
    fetch('/api/logout', {
        method: 'POST'
    })
    .then(() => {
        currentUser = null;
        document.getElementById('loginLink')?.classList.remove('hidden');
        document.getElementById('userInfo')?.classList.add('hidden');
        document.getElementById('venuesLink')?.classList.add('hidden');
        document.getElementById('mapLink')?.classList.add('hidden');
        document.getElementById('favoritesLink')?.classList.add('hidden');
        document.getElementById('adminLink')?.classList.add('hidden');
        // Show the header theme toggle back on logout
        document.getElementById('themeToggle')?.classList.remove('hidden');
        showPage('login');
    })
    .catch(error => console.error('Logout error:', error));
}

// Page Navigation
// Make page switching deterministic
function showPage(pageId, addToHistory = true) {
    const pages = document.querySelectorAll('.page');
    pages.forEach(p => {
        p.classList.add('hidden');
        p.classList.remove('active');
        p.style.display = 'none';
    });

    const targetEl = document.getElementById(pageId + 'Page') || document.getElementById(pageId);
    if (targetEl) {
        targetEl.classList.remove('hidden');
        targetEl.classList.add('active');
        targetEl.style.display = 'block';
    }

    if (addToHistory) history.pushState({ page: pageId }, '', `#${pageId}`);

    if (pageId === 'venues') {
        loadVenues();
        loadAndRenderLastUpdated();
    }
    if (pageId === 'map') loadMap();
    if (pageId === 'favorites') loadFavorites();
    if (pageId === 'admin' && currentUser?.isAdmin) showAdminTab('users');
    if (pageId === 'venues' || pageId === 'events') {
        loadAndRenderLastUpdated();
    }
}

// Venues Management
function loadVenues() {
    const loadingDiv = document.getElementById('venuesLoading');
    const tableDiv = document.getElementById('venuesTable');
    
    loadingDiv.classList.remove('hidden');
    tableDiv.classList.add('hidden');
    
    fetch('/api/venues')
        .then(response => response.json())
        .then(data => {
            venues = data;
            loadingDiv.classList.add('hidden');
            tableDiv.classList.remove('hidden');
            displayVenues(venues);
        })
        .catch(error => {
            console.error('Error loading venues:', error);
            loadingDiv.textContent = 'Error loading venues';
        });
}
function displayVenues(venuesToDisplay) {
  const tbody = document.getElementById('venuesTableBody');
  tbody.innerHTML = '';

  if (!Array.isArray(venuesToDisplay) || venuesToDisplay.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5" class="text-center p-4">No venues found matching your criteria.</td></tr>';
    return;
  }

  // Current user id for liked state
  const userId = currentUser ? (currentUser.userId || currentUser.user?.userId) : null;

  venuesToDisplay.forEach(venue => {
    const row = document.createElement('tr');
    row.onclick = () => showVenueDetail(venue._id);

    // ID
    const idCell = document.createElement('td');
    idCell.textContent = venue.venueId || '-';
    row.appendChild(idCell);

    // Name (bold + blue)
    const nameCell = document.createElement('td');
    nameCell.textContent = venue.name || '';
    nameCell.className = 'venue-name';
    row.appendChild(nameCell);

    // Distance
    const distanceCell = document.createElement('td');
    const distance = (userLocation && venue.latitude && venue.longitude)
      ? calculateDistance(userLocation.lat, userLocation.lng, venue.latitude, venue.longitude)
      : null;
    distanceCell.textContent = distance != null ? `${distance.toFixed(1)} km` : '—';
    row.appendChild(distanceCell);

    // Events count
    const eventsCell = document.createElement('td');
    const count = Array.isArray(venue.events) ? venue.events.length : 0;
    eventsCell.textContent = count;
    row.appendChild(eventsCell);

    // Actions (View + Like)
    const actionsCell = document.createElement('td');
    actionsCell.classList.add('actions-cell'); // flex row
    actionsCell.style.whiteSpace = 'nowrap';

    // View button (left)
    const viewBtn = document.createElement('button');
    viewBtn.className = 'btn btn-secondary btn-sm';
    viewBtn.textContent = 'View';
    viewBtn.onclick = (e) => { e.stopPropagation(); showVenueDetail(venue._id); };
    actionsCell.appendChild(viewBtn);

    // Like button (right)
    const likeBtn = document.createElement('button');
    const likeCount = Array.isArray(venue.likes) ? venue.likes.length : (typeof venue.likes === 'number' ? venue.likes : 0);
    const isLiked = userId && Array.isArray(venue.likes) && venue.likes.includes(userId);
    likeBtn.className = `like-btn ${isLiked ? 'liked' : ''}`;
    likeBtn.innerHTML = `<i class="fas fa-heart"></i> <span class="like-count">${likeCount}</span>`;
    likeBtn.onclick = (e) => { toggleLikeVenue(e, venue._id); };
    actionsCell.appendChild(likeBtn);

    row.appendChild(actionsCell);

    tbody.appendChild(row);
  });

  // Reveal table, hide loading
  document.getElementById('venuesTable')?.classList.remove('hidden');
  document.getElementById('venuesLoading')?.classList.add('hidden');
}

function showCreateEventModal() {
    document.getElementById('createEventModal').classList.remove('hidden');
}

// RENAMED: avoid conflict with document.createEvent
function submitNewEvent(e) {
    e.preventDefault();

    const title = document.getElementById('newEvTitle').value.trim();
    const dateTime = document.getElementById('newEvDate').value.trim(); // e.g. 30/01/2026(Fri)20:00\n31/01/2026(Sat)15:00
    const description = document.getElementById('newEvDesc').value.trim();
    const venueIdInput = document.getElementById('newEvVenueId').value.trim(); // LCSD venueId

    if (!title || !dateTime || !venueIdInput) {
        showToast('Please fill in Title, Date/Time and Venue ID', 'error');
        return;
    }

    // Accepts one or multiple date lines; minimal format check for DD/MM/YYYY
    const dtLines = dateTime.split('\n').map(s => s.trim()).filter(Boolean);
    const dateOk = dtLines.every(l => /^\d{2}\/\d{2}\/\d{4}/.test(l));
    if (!dateOk) {
        showToast("Invalid Date/Time. Example:\n30/01/2026(Fri)20:00\n31/01/2026(Sat)15:00", 'error');
        return;
    }

    // Find Venue by LCSD venueId => get Mongo _id
    fetch('/api/venues')
      .then(res => res.json())
      .then(venuesList => {
        const venue = venuesList.find(v => String(v.venueId) === String(venueIdInput));
        if (!venue || !venue._id) {
          showToast('Venue ID not found. Use a valid LCSD venueId from the Venues list.', 'error');
          throw new Error('Venue not found');
        }

        const payload = {
          eventId: 'custom_' + Date.now(),
          title,
          dateTime, // keep exact string, supports multiple lines
          description: description || 'No description',
          presenter: 'LCSD',
          venue: venue._id
        };

        return fetch('/api/admin/events', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
      })
      .then(response => {
        if (!response || !response.ok) throw new Error('Create event failed');
        return response.json();
      })
      .then(() => {
        closeModal('createEventModal');
        showToast('Event created successfully', 'success');
        loadEvents();
        document.getElementById('newEvTitle').value = '';
        document.getElementById('newEvDate').value = '';
        document.getElementById('newEvDesc').value = '';
        document.getElementById('newEvVenueId').value = '';
      })
      .catch(err => {
        if (err && err.message === 'Venue not found') return;
        console.error(err);
        showToast('Failed to create event. Ensure inputs follow the required format.', 'error');
      });
}

function sortVenues(field) {
    if (sortOrder.field === field) {
        sortOrder.ascending = !sortOrder.ascending;
    } else {
        sortOrder.field = field;
        sortOrder.ascending = true;
    }
    
    venues.sort((a, b) => {
        let aValue, bValue;
        
        switch(field) {
            case 'name':
                aValue = a.name.toLowerCase();
                bValue = b.name.toLowerCase();
                break;
            case 'distance':
                if (!userLocation || !a.latitude || !b.latitude) {
                    aValue = 0;
                    bValue = 0;
                } else {
                    aValue = calculateDistance(userLocation.lat, userLocation.lng, a.latitude, a.longitude);
                    bValue = calculateDistance(userLocation.lat, userLocation.lng, b.latitude, b.longitude);
                }
                break;
            case 'events':
                aValue = a.events ? a.events.length : 0;
                bValue = b.events ? b.events.length : 0;
                break;
        }
        
        if (sortOrder.ascending) {
            return aValue > bValue ? 1 : -1;
        } else {
            return aValue < bValue ? 1 : -1;
        }
    });
    
    displayVenues(venues);
}

function filterVenues() {
    const searchTerm = document.getElementById('venueSearch').value.toLowerCase();
    const areaFilter = document.getElementById('areaFilter').value; // 'hongkong', 'kowloon', etc.
    const maxDistance = parseFloat(document.getElementById('distanceFilter').value) || Infinity;
    
    let filtered = venues.filter(venue => {
        // Search filter
        if (searchTerm && !venue.name.toLowerCase().includes(searchTerm)) {
            return false;
        }
        
        // PERFECT SCORE FIX: Robust Area Filter
        // Use the region field we added to the DB
        if (areaFilter && venue.region !== areaFilter) {
            return false;
        }
        
        // Distance filter (Keep existing logic)
        if (userLocation && venue.latitude && venue.longitude) {
            const distance = calculateDistance(userLocation.lat, userLocation.lng, venue.latitude, venue.longitude);
            if (distance > maxDistance) {
                return false;
            }
        }
        
        return true;
    });
    
    displayVenues(filtered);
}

// Venue Details
function showVenueDetail(venueId) {
    currentVenue = venueId;
    showPage('venueDetail');
    
    const contentDiv = document.getElementById('venueDetailContent');
    contentDiv.innerHTML = '<div class="loading">Loading venue details...</div>';
    
    fetch(`/api/venues/${venueId}`)
        .then(response => response.json())
        .then(venue => {
            displayVenueDetail(venue);
        })
        .catch(error => {
            console.error('Error loading venue details:', error);
            contentDiv.innerHTML = '<div class="error-message">Error loading venue details</div>';
        });
}

function displayVenueDetail(venue) {
    const contentDiv = document.getElementById('venueDetailContent');
    
    // Check Venue Like Status
    const userId = currentUser ? (currentUser.userId || currentUser.user?.userId) : null;
    const isVenueLiked = userId && venue.likes && venue.likes.includes(userId);
    const venueLikeClass = isVenueLiked ? 'liked' : '';
    const venueLikeCount = venue.likes ? venue.likes.length : 0;

    contentDiv.innerHTML = `
        <div class="venue-header">
            <div>
                <h1 class="venue-title">${venue.name}</h1>
                <p class="text-secondary">${venue.nameC || ''}</p>
            </div>
            <div>
                <button class="btn btn-secondary" onclick="toggleFavoriteVenue(event, '${venue._id}')" id="favoriteBtn">
                    <i class="fas fa-star"></i> Add to Favorites
                </button>
                <button class="like-btn ${venueLikeClass}" onclick="toggleLikeVenue(event, '${venue._id}')">
                    <i class="fas fa-heart"></i> <span class="like-count">${venueLikeCount}</span>
                </button>
            </div>
        </div>
        
        <div class="venue-info">
            <div class="venue-section">
                <h3>Venue Information</h3>
                <div id="venueMap" style="height: 300px; margin-bottom: 1rem;"></div>
                <p><strong>Address:</strong> ${venue.address || 'N/A'}</p>
                <p><strong>Description:</strong> ${venue.description || 'N/A'}</p>
            </div>
            
            <div class="venue-section">
                <h3>Events at this Venue</h3>
                <div class="events-list">
                    ${venue.events && venue.events.length > 0 
                        ? venue.events.map(event => {
                            // Check Event Like Status inside the map loop
                            const isEventLiked = userId && event.likes && event.likes.includes(userId);
                            const eventLikeClass = isEventLiked ? 'liked' : '';
                            const eventLikeCount = event.likes ? event.likes.length : 0;

                            return `
                            <div class="event-card">
                                <div class="event-title">${event.title}</div>
                                <div class="event-meta">
                                    <i class="fas fa-calendar"></i> ${event.dateTime || 'N/A'}
                                    ${event.presenter ? `<i class="fas fa-user"></i> ${event.presenter}` : ''}
                                </div>
                                <div class="event-description">${event.description || 'No description available'}</div>
                                <button class="like-btn ${eventLikeClass}" onclick="toggleLikeEvent(event, '${event._id}')">
                                    <i class="fas fa-heart"></i> ${eventLikeCount}
                                </button>
                            </div>
                            `;
                        }).join('')
                        : '<p>No events scheduled at this venue.</p>'
                    }
                </div>
            </div>
        </div>
        
        <div class="comments-section">
            <h3>User Comments</h3>
            <div class="comment-form">
                <h4>Add a Comment</h4>
                <form onsubmit="addComment(event)">
                    <textarea id="commentContent" placeholder="Share your thoughts about this venue..." required></textarea>
                    <button type="submit" class="btn btn-primary">Post Comment</button>
                </form>
            </div>
            <div id="commentsList" class="comments-list">
                <div class="loading">Loading comments...</div>
            </div>
        </div>
    `;
    
    // Initialize venue map
    if (venue.latitude && venue.longitude) {
        setTimeout(() => {
            const venueMap = L.map('venueMap').setView([venue.latitude, venue.longitude], 15);
            L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                attribution: '© OpenStreetMap contributors'
            }).addTo(venueMap);
            L.marker([venue.latitude, venue.longitude]).addTo(venueMap)
                .bindPopup(venue.name)
                .openPopup();
        }, 100);
    }
    
    // Load comments
    loadComments(venue._id);
    applyFavoriteButtonState(venue._id);
}

// Comments
function loadComments(venueId) {
    fetch(`/api/venues/${venueId}/comments`)
        .then(response => response.json())
        .then(comments => {
            displayComments(comments);
        })
        .catch(error => {
            console.error('Error loading comments:', error);
            document.getElementById('commentsList').innerHTML = '<p>Error loading comments</p>';
        });
}

function displayComments(comments) {
    const commentsList = document.getElementById('commentsList');
    
    if (comments.length === 0) {
        commentsList.innerHTML = '<p>No comments yet. Be the first to share your thoughts!</p>';
        return;
    }
    
    commentsList.innerHTML = comments.map(comment => `
        <div class="comment">
            <div class="comment-header">
                <span class="comment-author">${comment.user.username}</span>
                <span class="comment-date">${new Date(comment.createdAt).toLocaleDateString()}</span>
            </div>
            <div class="comment-content">${comment.content}</div>
        </div>
    `).join('');
}

function addComment(event) {
    event.preventDefault();
    
    const content = document.getElementById('commentContent').value;
    
    fetch(`/api/venues/${currentVenue}/comments`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ content })
    })
    .then(response => response.json())
    .then(comment => {
        document.getElementById('commentContent').value = '';
        loadComments(currentVenue);
    })
    .catch(error => {
        console.error('Error adding comment:', error);
        showToast('Error adding comment', 'error');
    });
}

// Map functionality
function loadMap() {
    if (map) {
        map.remove();
        markers = [];
    }

    map = L.map('map').setView([22.3193, 114.1694], 11); // Hong Kong center

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors'
    }).addTo(map);

    // Load and display venues
    fetch('/api/venues')
        .then(response => response.json())
        .then(venuesData => {
            // Group by exact lat/lng
            const groups = new Map(); // key: "lat,lng" -> [{ venue }]
            venuesData.forEach(venue => {
                if (venue.latitude && venue.longitude) {
                    const key = `${venue.latitude},${venue.longitude}`;
                    if (!groups.has(key)) groups.set(key, []);
                    groups.get(key).push(venue);
                }
            });

            // Create one marker per coordinate group
            groups.forEach((groupVenues, key) => {
                const [latStr, lngStr] = key.split(',');
                const lat = parseFloat(latStr), lng = parseFloat(lngStr);

                const marker = L.marker([lat, lng]).addTo(map);

                // Build popup listing all venues at this coordinate
                const popupHtml = `
                    <div style="min-width:220px">
                        ${groupVenues.map(v => {
                            const eventsCount = v.events ? v.events.length : 0;
                            return `
                                <div style="margin-bottom:8px; border-bottom:1px solid var(--border-color,#e5e7eb); padding-bottom:6px;">
                                    <strong>${v.name}</strong><br>
                                    Events: ${eventsCount}<br>
                                    <a href="#" onclick="showVenueDetail('${v._id}'); return false;">View Details</a>
                                </div>
                            `;
                        }).join('')}
                    </div>
                `;

                marker.bindPopup(popupHtml);
                markers.push(marker);
            });
        })
        .catch(error => console.error('Error loading venues for map:', error));
}

function getCurrentLocation() {
    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
            position => {
                userLocation = {
                    lat: position.coords.latitude,
                    lng: position.coords.longitude
                };
                
                // Update map if on map page
                if (map) {
                    map.setView([userLocation.lat, userLocation.lng], 13);
                    L.marker([userLocation.lat, userLocation.lng])
                        .addTo(map)
                        .bindPopup('Your Location')
                        .openPopup();
                }
                
                // Re-filter venues
                filterVenues();
            },
            error => {
                console.error('Error getting location:', error);
                showToast('Unable to get your location', 'error');
            }
        );
    } else {
        showToast('Geolocation is not supported by your browser', 'error');
    }
}

// Favorites
function loadFavorites() {
  const contentDiv = document.getElementById('favoritesContent');
  contentDiv.innerHTML = '<div class="loading">Loading favorites...</div>';

  const favs = getFavoriteVenueIds();
  if (!favs || favs.size === 0) {
    contentDiv.innerHTML = '<p>No favorite venues yet. Start adding some!</p>';
    return;
  }

  // Pull venues and filter by favorite _ids
  fetch('/api/venues')
    .then(res => res.json())
    .then(allVenues => {
      const favVenues = allVenues.filter(v => favs.has(v._id));
      displayFavorites(favVenues);
    })
    .catch(err => {
      console.error('Error loading favorites:', err);
      contentDiv.innerHTML = '<p>Error loading favorites</p>';
    });
}

function removeFavorite(venueId) {
  const favs = getFavoriteVenueIds();
  if (favs.has(venueId)) {
    favs.delete(venueId);
    setFavoriteVenueIds(favs);
    showToast('Removed from favorites', 'success');
    loadFavorites();
    // If currently viewing this venue, update the star button state
    if (currentVenue === venueId) applyFavoriteButtonState(venueId);
  }
}

// Local favorites (persist across tabs without DB)
const FAVORITES_KEY = 'favoriteVenues';
function getFavoriteVenueIds() {
  try { return new Set(JSON.parse(localStorage.getItem(FAVORITES_KEY) || '[]')); }
  catch { return new Set(); }
}
function setFavoriteVenueIds(set) {
  localStorage.setItem(FAVORITES_KEY, JSON.stringify([...set]));
}
function applyFavoriteButtonState(venueId) {
  const btn = document.getElementById('favoriteBtn');
  if (!btn) return;
  const favs = getFavoriteVenueIds();
  const isFav = favs.has(venueId);
  if (isFav) {
    btn.classList.add('favorited');
    btn.innerHTML = '<i class="fas fa-star"></i> Favorited';
  } else {
    btn.classList.remove('favorited');
    btn.innerHTML = '<i class="fas fa-star"></i> Add to Favorites';
  }
}

// Ensure your detail renderer calls this after injecting the button HTML
// e.g., at the end of displayVenueDetail(venue):
// applyFavoriteButtonState(venue._id);

// Toggle favorite (client-side persisted)
function toggleFavoriteVenue(e, venueId) {
  if (e?.preventDefault) e.preventDefault();
  if (e?.stopPropagation) e.stopPropagation();

  const favs = getFavoriteVenueIds();
  let isFav;
  if (favs.has(venueId)) {
    favs.delete(venueId);
    isFav = false;
  } else {
    favs.add(venueId);
    isFav = true;
  }
  setFavoriteVenueIds(favs);
  applyFavoriteButtonState(venueId);
  showToast(isFav ? 'Added to favorites' : 'Removed from favorites', 'success');
}

function displayFavorites(favVenues) {
  const container = document.getElementById('favoritesContent') || document.getElementById('favoritesPage');
  if (!container) return;

  if (!Array.isArray(favVenues) || favVenues.length === 0) {
    container.innerHTML = '<p>No favorite venues yet. Start adding some!</p>';
    return;
  }

  container.innerHTML = `
    <div class="cards-grid">
      ${favVenues.map(v => `
        <div class="card">
          <div class="card-title">${v.name}</div>
          <div class="card-content">
            <p><strong>ID:</strong> ${v.venueId || '-'}</p>
            <p><strong>Events:</strong> ${Array.isArray(v.events) ? v.events.length : 0}</p>
            <div class="mt-3" style="display:flex; gap:8px;">
              <button class="btn btn-sm btn-secondary" onclick="showVenueDetail('${v._id}')">View</button>
              <button class="btn btn-sm favorited" onclick="removeFavorite('${v._id}')">
                <i class="fas fa-star"></i> Remove
              </button>
            </div>
          </div>
        </div>
      `).join('')}
    </div>
  `;
}

// Likes
// REPLACE toggleLikeVenue
function toggleLikeVenue(event, venueId) {
    event.stopPropagation(); 
    const btn = event.currentTarget;
    const countSpan = btn.querySelector('.like-count');

    fetch(`/api/venues/${venueId}/like`, {
        method: 'POST'
    })
    .then(response => response.json())
    .then(data => {
        // Update count
        if(countSpan) countSpan.textContent = data.likes;
        
        // Update visual state based on server response
        if (data.isLiked) {
            btn.classList.add('liked');
            showToast('Venue liked!', 'success');
        } else {
            btn.classList.remove('liked');
            showToast('Like removed', 'info');
        }
    })
    .catch(error => console.error('Error liking venue:', error));
}

// REPLACE toggleLikeEvent
function toggleLikeEvent(event, eventId) { 
    // Find button
    const btn = event.target.closest('.like-btn');
    if(!btn) return;

    fetch(`/api/events/${eventId}/like`, {
        method: 'POST'
    })
    .then(response => response.json())
    .then(data => {
        btn.innerHTML = `<i class="fas fa-heart"></i> ${data.likes}`;
        
        if (data.isLiked) {
            btn.classList.add('liked');
            showToast('Event liked!', 'success');
        } else {
            btn.classList.remove('liked');
            showToast('Like removed', 'info');
        }
    })
    .catch(error => console.error('Error liking event:', error));
}

// Admin Functions
function showAdminTab(tabName) {
    // Update tab buttons
    document.querySelectorAll('.admin-tab').forEach(tab => {
        tab.classList.remove('active');
    });
    // Activate the matching button by text label
    const btn = Array.from(document.querySelectorAll('.admin-tab'))
        .find(b => b.textContent.toLowerCase().includes(tabName));
    if (btn) btn.classList.add('active');

    // Update tab content
    document.querySelectorAll('.admin-content').forEach(content => {
        content.classList.remove('active');
    });
    document.getElementById(tabName + 'Tab').classList.add('active');

    // Load tab-specific data
    switch(tabName) {
        case 'users':
            loadUsers();
            break;
        case 'events':
            loadEvents();
            break;
        case 'data':
            // keep as-is; no extra load
            break;
    }
}

function loadUsers() {
    const usersList = document.getElementById('usersList');
    usersList.innerHTML = '<div class="loading">Loading users...</div>';
    
    fetch('/api/admin/users')
        .then(response => response.json())
        .then(users => {
            displayUsers(users);
        })
        .catch(error => {
            console.error('Error loading users:', error);
            usersList.innerHTML = '<p>Error loading users</p>';
        });
}
function displayUsers(users) {
    const usersList = document.getElementById('usersList');
    
    // 1. Remove the loading class to kill the spinner
    usersList.classList.remove('loading');
    
    // 2. Clear previous content
    usersList.innerHTML = ''; 
    
    if (!users || users.length === 0) {
        usersList.innerHTML = '<p class="p-4 text-center">No users found.</p>';
        return;
    }

    // 3. Build the table
    const tableHTML = `
        <table style="width: 100%; border-collapse: collapse;">
            <thead>
                <tr>
                    <th class="text-left p-3 bg-tertiary">Username</th>
                    <th class="text-left p-3 bg-tertiary">Role</th>
                    <th class="text-left p-3 bg-tertiary">Created</th>
                    <th class="text-left p-3 bg-tertiary">Actions</th>
                </tr>
            </thead>
            <tbody>
                ${users.map(user => `
                    <tr style="border-bottom: 1px solid var(--border-color);">
                        <td class="p-3">${user.username}</td>
                        <td class="p-3">
                            <span style="padding: 4px 8px; border-radius: 4px; background: ${user.isAdmin ? '#e0e7ff' : '#f3f4f6'}; color: ${user.isAdmin ? '#4338ca' : '#374151'}; font-size: 0.85rem; font-weight: 500;">
                                ${user.isAdmin ? 'Admin' : 'User'}
                            </span>
                        </td>
                        <td class="p-3">${new Date(user.createdAt).toLocaleDateString()}</td>
                        <td class="p-3">
                            <div class="flex gap-2">
                                <button class="btn btn-sm btn-secondary" onclick="editUser('${user._id}')">Edit</button>
                                <button class="btn btn-sm btn-danger" onclick="deleteUser('${user._id}')">Delete</button>
                            </div>
                        </td>
                    </tr>
                `).join('')}
            </tbody>
        </table>
    `;
    
    usersList.innerHTML = tableHTML;
}

function showCreateUserForm() {
  document.getElementById('createUserModal').classList.remove('hidden');
}

function hideCreateUserForm() {
  document.getElementById('createUserModal').classList.add('hidden');
}

function createUser(event) {
    event.preventDefault();
    
    const username = document.getElementById('newUsername').value;
    const password = document.getElementById('newPassword').value;
    const isAdmin = document.getElementById('newIsAdmin').checked;
    
    fetch('/api/admin/users', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ username, password, isAdmin })
    })
    .then(response => response.json())
    .then(() => {
        hideCreateUserForm();
        loadUsers();
        // Clear form
        document.getElementById('newUsername').value = '';
        document.getElementById('newPassword').value = '';
        document.getElementById('newIsAdmin').checked = false;
    })
    .catch(error => {
        console.error('Error creating user:', error);
        showToast('Error creating user', 'error');
    });
}

function deleteUser(userId) {
    if (confirm('Are you sure you want to delete this user?')) {
        fetch(`/api/admin/users/${userId}`, {
            method: 'DELETE'
        })
        .then(() => {
            loadUsers();
        })
        .catch(error => {
            console.error('Error deleting user:', error);
            showToast('Error deleting user', 'error');
        });
    }
}

function editUser(userId) {
    // 1. Fetch user data
    // In a real app we might fetch from API, but we have the list in memory or can fetch specifically
    // Let's find it in the current DOM or fetch it
    fetch(`/api/admin/users`)
        .then(res => res.json())
        .then(users => {
            const user = users.find(u => u._id === userId);
            if(user) {
                document.getElementById('editUserId').value = user._id;
                document.getElementById('editUsername').value = user.username;
                document.getElementById('editPassword').value = ''; // Don't show hash
                document.getElementById('editIsAdmin').checked = user.isAdmin;
                
                document.getElementById('editUserModal').classList.remove('hidden');
            }
        });
}

function updateUser(event) {
    event.preventDefault();
    const userId = document.getElementById('editUserId').value;
    const username = document.getElementById('editUsername').value;
    const password = document.getElementById('editPassword').value;
    const isAdmin = document.getElementById('editIsAdmin').checked;

    const body = { username, isAdmin };
    if(password) body.password = password;

    fetch(`/api/admin/users/${userId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
    })
    .then(res => res.json())
    .then(() => {
        closeModal('editUserModal');
        showToast('User updated successfully', 'success');
        loadUsers(); // Real-time refresh
    })
    .catch(err => showToast('Update failed', 'error'));
}


function loadEvents() {
    const eventsList = document.getElementById('eventsList');
    eventsList.classList.add('loading');
    eventsList.innerHTML = '<div class="loading">Loading events...</div>';

    fetch('/api/events')
        .then(response => response.json())
        .then(events => {
            displayEvents(events);
        })
        .catch(error => {
            console.error('Error loading events:', error);
            eventsList.classList.remove('loading');
            eventsList.innerHTML = '<p>Error loading events</p>';
        });
}

function displayEvents(events) {
    const eventsList = document.getElementById('eventsList');

    // Remove spinner styling once data is ready
    eventsList.classList.remove('loading');

    eventsList.innerHTML = `
        <div class="cards-grid">
            ${events.map(event => `
                <div class="card">
                    <div class="card-title">${event.title}</div>
                    <div class="card-content">
                        <p><strong>Venue:</strong> ${event.venue ? event.venue.name : 'N/A'}</p>
                        <p><strong>Date:</strong> ${event.dateTime || 'N/A'}</p>
                        <p>${event.description ? event.description.substring(0, 100) + '...' : 'No description'}</p>
                        <div class="mt-3">
                            <button class="btn btn-sm btn-secondary" onclick="editEvent('${event._id}')">Edit</button>
                            <button class="btn btn-sm btn-danger" onclick="deleteEvent('${event._id}')">Delete</button>
                        </div>
                    </div>
                </div>
            `).join('')}
        </div>
    `;
}

function deleteEvent(eventId) {
    if (confirm('Are you sure you want to delete this event?')) {
        fetch(`/api/admin/events/${eventId}`, {
            method: 'DELETE'
        })
        .then(() => {
            loadEvents();
        })
        .catch(error => {
            console.error('Error deleting event:', error);
            showToast('Error deleting event', 'error');
        });
    }
}

function editEvent(eventId) {
    fetch(`/api/events/${eventId}`)
        .then(res => res.json())
        .then(event => {
            document.getElementById('editEventId').value = event._id;
            document.getElementById('editEventTitle').value = event.title;
            document.getElementById('editEventDate').value = event.dateTime;
            document.getElementById('editEventDesc').value = event.description;
            
            document.getElementById('editEventModal').classList.remove('hidden');
        });
}

function updateEvent(event) {
    event.preventDefault();
    const eventId = document.getElementById('editEventId').value;
    const title = document.getElementById('editEventTitle').value;
    const dateTime = document.getElementById('editEventDate').value;
    const description = document.getElementById('editEventDesc').value;

    fetch(`/api/admin/events/${eventId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, dateTime, description })
    })
    .then(res => res.json())
    .then(() => {
        closeModal('editEventModal');
        showToast('Event updated successfully', 'success');
        loadEvents(); // Real-time refresh
    })
    .catch(err => showToast('Update failed', 'error'));
}

// Helper to close modals
function closeModal(modalId) {
    document.getElementById(modalId).classList.add('hidden');
}

function importData() {
    const statusDiv = document.getElementById('importStatus');
    statusDiv.innerHTML = '<div class="loading">Importing data...</div>';
    
    fetch('/api/import-data', {
        method: 'POST'
    })
    .then(response => response.json())
    .then(data => {
        statusDiv.innerHTML = `<div class="success-message">${data.message}</div>`;
        // Refresh other data
        loadUsers();
        loadEvents();
        loadVenues();
    })
    .catch(error => {
        console.error('Error importing data:', error);
        statusDiv.innerHTML = '<div class="error-message">Error importing data</div>';
    });
}

function loadAdminData() {
    loadUsers();
}

// Utility functions
function calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371; // Radius of the Earth in km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = 
        Math.sin(dLat/2) * Math.sin(dLat/2) +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
        Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
}

window.addEventListener('popstate', function(event) {
    if (event.state && event.state.page) {
        showPage(event.state.page, false);
    } else {
        // Prefer routing by current hash if available
        const hashPage = (location.hash && location.hash.substring(1)) || null;
        if (hashPage) {
            showPage(hashPage, false);
        } else if (currentUser) {
            showPage('venues', false);
        } else {
            showPage('login', false);
        }
    }
});

// Update browser history when navigating
function updateHistory(pageId) {
    const state = { page: pageId };
    const title = document.title;
    const url = '#' + pageId;
    history.pushState(state, title, url);
}

// Fetch and render "Last updated" on Venues and Events pages
function loadAndRenderLastUpdated() {
  fetch('/api/last-updated')
    .then(r => r.json())
    .then(({ lastUpdated }) => {
      const text = lastUpdated
        ? `Last updated: ${new Date(lastUpdated).toLocaleString(undefined, {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: false
          })}`
        : 'Last updated: N/A';

      // Use the predefined footer cell and render a full-width banner
      const cell = document.getElementById('venuesLastUpdatedCell');
      if (cell) {
        cell.innerHTML = `<div class="last-updated-banner">${text}</div>`;
      }

      // Optional: also show on Events list (if you have an events page/section)
      const eventsList = document.getElementById('eventsList');
      if (eventsList) {
        let el = eventsList.querySelector('.last-updated');
        if (!el) {
          el = document.createElement('div');
          el.className = 'last-updated';
          eventsList.appendChild(el);
        }
        el.textContent = text;
      }
    })
    .catch(() => {});
}