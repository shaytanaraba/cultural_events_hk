const express = require('express');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const session = require('express-session');
const cors = require('cors');
const xml2js = require('xml2js');
const axios = require('axios');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));
app.use(session({
  secret: 'csci2720-project-secret-key',
  resave: false,
  saveUninitialized: false,
  cookie: { secure: false } // For development
}));

// MongoDB Connection
mongoose.connect('mongodb://localhost:27017/cultural_events');

// Data Models
const User = mongoose.model('User', {
  username: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  isAdmin: { type: Boolean, default: false },
  favorites: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Venue' }],
  createdAt: { type: Date, default: Date.now }
});

const Venue = mongoose.model('Venue', {
  venueId: { type: String, required: true, unique: true },
  name: { type: String, required: true },
  nameC: { type: String },
  latitude: { type: Number },
  longitude: { type: Number },
  region: { type: String },
  address: { type: String },
  description: { type: String },
  events: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Event' }],
  likes: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  lastUpdated: { type: Date, default: Date.now }
});

const Event = mongoose.model('Event', {
  eventId: { type: String, required: true, unique: true },
  title: { type: String, required: true },
  titleC: { type: String },
  venue: { type: mongoose.Schema.Types.ObjectId, ref: 'Venue', required: true },
  description: { type: String },
  presenter: { type: String },
  dateTime: { type: String },
  category: { type: String },
  price: { type: String },
  url: { type: String },
  likes: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  lastUpdated: { type: Date, default: Date.now }
});

const Comment = mongoose.model('Comment', {
  venue: { type: mongoose.Schema.Types.ObjectId, ref: 'Venue', required: true },
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  content: { type: String, required: true },
  createdAt: { type: Date, default: Date.now }
});

const SystemInfo = mongoose.model('SystemInfo', {
  key: { type: String, unique: true, required: true },
  lastUpdated: { type: Date }
});

// Meta store for global flags/timestamps
const Meta = mongoose.model('Meta', {
  key: { type: String, unique: true },
  value: mongoose.Schema.Types.Mixed,
  updatedAt: { type: Date, default: Date.now }
});

// Utility to safely get text from parsed xml2js nodes
function getText(node, key) {
  const v = node?.[key];
  if (!v) return '';
  const raw = Array.isArray(v) ? v[0] : v;
  return (typeof raw === 'string' ? raw : raw?._ || '').toString().trim();
}

// Rough classifier: HK Island (south of harbor), Kowloon (north of harbor), else New Territories.
// Tuned for LCSD venue coordinates; adjust thresholds if needed.
function classifyRegion(lat, lng) {
  // Unknown or missing coords => others
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return 'others';

  // Hong Kong Island: roughly below ~22.285
  if (lat < 22.285) return 'hongkong';

  // Kowloon: roughly 22.285–22.36 and within main Kowloon longitudes
  if (lat >= 22.285 && lat < 22.36 && lng > 113.9 && lng < 114.27) return 'kowloon';

  // New Territories: north of Kowloon within HK longitudes
  if (lat >= 22.36 && lng > 113.8 && lng < 114.4) return 'newterritories';

  // Everything else (outliers/outside bounds)
  return 'others';
}

// Authentication Middleware
function isAuthenticated(req, res, next) {
  if (req.session.userId) {
    next();
  } else {
    res.status(401).json({ error: 'Not authenticated' });
  }
}

function isAdmin(req, res, next) {
  if (req.session.isAdmin) {
    next();
  } else {
    res.status(403).json({ error: 'Not authorized' });
  }
}

// API Routes

// Authentication
app.post('/api/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    const user = await User.findOne({ username });

    if (!user || !(await bcrypt.compare(password, user.password))) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Create session first
    req.session.userId = user._id;
    req.session.username = user.username;
    req.session.isAdmin = user.isAdmin;

    // Import once per login session
    const now = new Date();
    let didImport = false;

    if (!req.session.didSync) {
      try {
        console.log('[Import] Starting importDataFromAPI for this session...');
        await importDataFromAPI();
        didImport = true;

        // Mark session as synced to avoid repeating during this session
        req.session.didSync = true;

        // Persist lastUpdated
        await SystemInfo.findOneAndUpdate(
          { key: 'data_sync' },
          { lastUpdated: now },
          { upsert: true, new: true }
        );
        console.log('[Import] importDataFromAPI completed.');
      } catch (e) {
        console.error('[Import] importDataFromAPI failed:', e);
        // Allow login to proceed even if import fails
      }
    } else {
      console.log('[Import] Skipped importDataFromAPI (already synced this session).');
    }

    // Read latest lastUpdated for response
    const sys = await SystemInfo.findOne({ key: 'data_sync' });

    res.json({
      message: 'Login successful',
      user: { username: user.username, isAdmin: user.isAdmin, userId: user._id },
      dataSync: {
        didImport,
        lastUpdated: sys?.lastUpdated || now
      }
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Login failed' });
  }
});

app.post('/api/logout', (req, res) => {
  req.session.destroy();
  res.json({ message: 'Logout successful' });
});

app.get('/api/session', (req, res) => {
  if (req.session.userId) {
    res.json({ 
      loggedIn: true, 
      username: req.session.username, 
      isAdmin: req.session.isAdmin 
    });
  } else {
    res.json({ loggedIn: false });
  }
});

// Venues
app.get('/api/venues', async (req, res) => {
  try {
    const { search, area, distance, lat, lng } = req.query;
    let query = {};
    
    if (search) {
      query.name = { $regex: search, $options: 'i' };
    }
    
    let venues = await Venue.find(query).populate('events');
    
    if (lat && lng && distance) {
      const userLat = parseFloat(lat);
      const userLng = parseFloat(lng);
      const maxDistance = parseFloat(distance);
      
      venues = venues.filter(venue => {
        if (!venue.latitude || !venue.longitude) return false;
        const dist = calculateDistance(userLat, userLng, venue.latitude, venue.longitude);
        return dist <= maxDistance;
      });
    }
    
    res.json(venues);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch venues' });
  }
});

app.get('/api/venues/:id', async (req, res) => {
  try {
    const venue = await Venue.findById(req.params.id).populate('events');
    if (!venue) {
      return res.status(404).json({ error: 'Venue not found' });
    }
    res.json(venue);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch venue' });
  }
});

// Events
app.get('/api/events', async (req, res) => {
  try {
    const events = await Event.find().populate('venue');
    res.json(events);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch events' });
  }
});

app.get('/api/events/:id', async (req, res) => {
  try {
    const event = await Event.findById(req.params.id).populate('venue');
    if (!event) {
      return res.status(404).json({ error: 'Event not found' });
    }
    res.json(event);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch event' });
  }
});

// Comments
app.get('/api/venues/:id/comments', async (req, res) => {
  try {
    const comments = await Comment.find({ venue: req.params.id })
      .populate('user', 'username')
      .sort({ createdAt: -1 });
    res.json(comments);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch comments' });
  }
});

app.post('/api/venues/:id/comments', isAuthenticated, async (req, res) => {
  try {
    const { content } = req.body;
    const comment = new Comment({
      venue: req.params.id,
      user: req.session.userId,
      content
    });
    await comment.save();
    await comment.populate('user', 'username');
    res.status(201).json(comment);
  } catch (error) {
    res.status(500).json({ error: 'Failed to add comment' });
  }
});

// Favorites
app.post('/api/venues/:id/favorite', isAuthenticated, async (req, res) => {
  try {
    const user = await User.findById(req.session.userId);
    const venueId = req.params.id;
    
    if (!user.favorites.includes(venueId)) {
      user.favorites.push(venueId);
      await user.save();
    }
    
    res.json({ message: 'Added to favorites' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to add favorite' });
  }
});

app.delete('/api/venues/:id/favorite', isAuthenticated, async (req, res) => {
  try {
    const user = await User.findById(req.session.userId);
    user.favorites = user.favorites.filter(fav => fav.toString() !== req.params.id);
    await user.save();
    res.json({ message: 'Removed from favorites' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to remove favorite' });
  }
});

app.get('/api/favorites', isAuthenticated, async (req, res) => {
  try {
    const user = await User.findById(req.session.userId).populate('favorites');
    res.json(user.favorites);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch favorites' });
  }
});

// Likes
app.post('/api/events/:id/like', isAuthenticated, async (req, res) => {
  try {
    const event = await Event.findById(req.params.id);
    const userId = req.session.userId;
    
    const index = event.likes.indexOf(userId);
    let liked = false;

    if (index === -1) {
      event.likes.push(userId);
      liked = true;
    } else {
      event.likes.splice(index, 1);
      liked = false;
    }
    
    await event.save();
    res.json({ likes: event.likes.length, isLiked: liked });
  } catch (error) {
    res.status(500).json({ error: 'Failed to like event' });
  }
});

app.post('/api/venues/:id/like', isAuthenticated, async (req, res) => {
  try {
    const venue = await Venue.findById(req.params.id);
    const userId = req.session.userId;
    
    const index = venue.likes.indexOf(userId);
    let liked = false;

    if (index === -1) {
      venue.likes.push(userId);
      liked = true;
    } else {
      venue.likes.splice(index, 1);
      liked = false;
    }
    
    await venue.save();
    res.json({ likes: venue.likes.length, isLiked: liked });
  } catch (error) {
    res.status(500).json({ error: 'Failed to like venue' });
  }
});

// Admin CRUD operations
app.post('/api/admin/users', isAdmin, async (req, res) => {
  try {
    const { username, password, isAdmin = false } = req.body;
    const hashedPassword = await bcrypt.hash(password, 10);
    const user = new User({ username, password: hashedPassword, isAdmin });
    await user.save();
    res.status(201).json(user);
  } catch (error) {
    res.status(500).json({ error: 'Failed to create user' });
  }
});

app.get('/api/admin/users', isAdmin, async (req, res) => {
  try {
    const users = await User.find().select('-password');
    res.json(users);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

app.put('/api/admin/users/:id', isAdmin, async (req, res) => {
  try {
    const { username, password, isAdmin } = req.body;
    const updateData = { username, isAdmin };
    
    if (password) {
      updateData.password = await bcrypt.hash(password, 10);
    }
    
    const user = await User.findByIdAndUpdate(req.params.id, updateData, { new: true }).select('-password');
    res.json(user);
  } catch (error) {
    res.status(500).json({ error: 'Failed to update user' });
  }
});

app.delete('/api/admin/users/:id', isAdmin, async (req, res) => {
  try {
    await User.findByIdAndDelete(req.params.id);
    res.json({ message: 'User deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete user' });
  }
});

app.post('/api/admin/events', isAdmin, async (req, res) => {
  try {
    const event = new Event(req.body);
    await event.save();

    // Keep venue->events in sync
    if (event.venue) {
      await Venue.findByIdAndUpdate(
        event.venue,
        { $addToSet: { events: event._id } },
        { new: true }
      );
    }

    res.status(201).json(event);
  } catch (error) {
    res.status(500).json({ error: 'Failed to create event' });
  }
});

app.put('/api/admin/events/:id', isAdmin, async (req, res) => {
  try {
    const event = await Event.findByIdAndUpdate(req.params.id, req.body, { new: true });
    res.json(event);
  } catch (error) {
    res.status(500).json({ error: 'Failed to update event' });
  }
});

app.delete('/api/admin/events/:id', isAdmin, async (req, res) => {
  try {
    const event = await Event.findById(req.params.id);

    await Event.findByIdAndDelete(req.params.id);

    if (event?.venue) {
      await Venue.findByIdAndUpdate(event.venue, { $pull: { events: event._id } });
    }

    res.json({ message: 'Event deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete event' });
  }
});

// Data import endpoint
app.post('/api/import-data', async (req, res) => {
  try {
    await importDataFromAPI();
    res.json({ message: 'Data imported successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to import data' });
  }
});

// Last updated timestamp
app.get('/api/last-updated', async (req, res) => {
  try {
    const sys = await SystemInfo.findOne({ key: 'data_sync' });
    res.json({ lastUpdated: sys?.lastUpdated || null });
  } catch (e) {
    console.error('GET /api/last-updated error:', e);
    res.status(500).json({ lastUpdated: null });
  }
});

// Helper function to calculate distance between two points
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

// Import data from LCSD public APIs (no local files)
async function importDataFromAPI() {
  const VENUES_URL = 'https://www.lcsd.gov.hk/datagovhk/event/venues.xml';
  const EVENTS_URL = 'https://www.lcsd.gov.hk/datagovhk/event/events.xml';
  const EVENT_DATES_URL = 'https://www.lcsd.gov.hk/datagovhk/event/eventDates.xml';

  try {
    console.log('[Import] Fetching XML from LCSD...');
    const [venuesResp, eventsResp, eventDatesResp] = await Promise.all([
      axios.get(VENUES_URL, { responseType: 'text', timeout: 20000 }),
      axios.get(EVENTS_URL, { responseType: 'text', timeout: 20000 }),
      axios.get(EVENT_DATES_URL, { responseType: 'text', timeout: 20000 })
    ]);

    console.log('[Import] Parsing XML...');
    const [venuesResult, eventsResult, eventDatesResult] = await Promise.all([
      xml2js.parseStringPromise(venuesResp.data),
      xml2js.parseStringPromise(eventsResp.data),
      xml2js.parseStringPromise(eventDatesResp.data)
    ]);

    const venueNodes = venuesResult?.venues?.venue || [];
    const eventNodes = eventsResult?.events?.event || [];
    const eventDateNodes =
      eventDatesResult?.event_dates?.event ||
      eventDatesResult?.events?.event ||
      [];

    // Build eventDates map: { [eventId]: string[] }
    const eventDatesMap = new Map();
    for (const d of eventDateNodes) {
      const id = d?.$?.id;
      if (!id) continue;
      // Known fields vary; try common keys (indate/date/datetime)
      const dates = []
        .concat(d.indate || [])
        .concat(d.date || [])
        .concat(d.datetime || [])
        .map(x => (typeof x === 'string' ? x : (x?._ || '')))
        .map(s => s.trim())
        .filter(Boolean);
      eventDatesMap.set(id, dates);
    }

    // Normalize venues: keep only those with lat/lng and English name
    const venuesRaw = venueNodes.map(v => {
      const id = v?.$?.id || '';
      const nameE = getText(v, 'venuee');
      const latStr =
        getText(v, 'latitude') || getText(v, 'Latitude') || getText(v, 'lat');
      const lngStr =
        getText(v, 'longitude') || getText(v, 'Longitude') || getText(v, 'long') || getText(v, 'lng');

      const latitude = parseFloat(latStr);
      const longitude = parseFloat(lngStr);

      return {
        id: id?.toString(),
        name: nameE || '', // English only per spec
        latitude: Number.isFinite(latitude) ? latitude : null,
        longitude: Number.isFinite(longitude) ? longitude : null
      };
    });

    // Normalize events
    const eventsRaw = eventNodes.map(e => {
      const id = e?.$?.id?.toString();
      const venueId = getText(e, 'venueid') || getText(e, 'venueId');
      const title = getText(e, 'titlee'); // English only
      const description = getText(e, 'desce');
      const predateE = getText(e, 'predateE') || getText(e, 'predatee');
      const presenter =
        getText(e, 'presentere') ||
        getText(e, 'presenterE') ||
        getText(e, 'presenter') ||
        'LCSD';

      // Prefer predateE; otherwise synthesize from eventDates list
      const datesFromMap = eventDatesMap.get(id || '') || [];
      const dateTime = predateE || (datesFromMap.length ? datesFromMap.join(', ') : 'TBA');

      return {
        id,
        venueId: venueId?.toString(),
        title,
        description: description || 'No description',
        dateTime,
        presenter
      };
    }).filter(e => e.id && e.venueId && e.title);

    // Count events per venue
    const eventsByVenue = new Map();
    for (const ev of eventsRaw) {
      if (!eventsByVenue.has(ev.venueId)) eventsByVenue.set(ev.venueId, []);
      eventsByVenue.get(ev.venueId).push(ev);
    }

    // Candidate venues: must have lat/lng and at least 3 events
    const candidates = venuesRaw.filter(v =>
      v.id && v.name && v.latitude != null && v.longitude != null &&
      (eventsByVenue.get(v.id)?.length || 0) >= 3
    );

    if (candidates.length < 10) {
      console.warn(`[Import] Only ${candidates.length} venues meet the criteria (need 10). Importing what’s available.`);
    }

    // Pick random 10 from candidates (shuffle, then slice)
    const shuffled = [...candidates];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    const selectedVenues = shuffled.slice(0, 10);

    const selectedVenueIds = new Set(selectedVenues.map(v => v.id));

    // Filter events to only those selected venues
    const selectedEvents = eventsRaw.filter(e => selectedVenueIds.has(e.venueId));

    console.log(`[Import] Selected venues: ${selectedVenues.length}, events: ${selectedEvents.length}`);

    // Replace existing Venue/Event collections to enforce the 10-venue constraint
    // Note: This will break existing favorites/likes references. Keep or remove as per your needs.
    await Event.deleteMany({});
    await Venue.deleteMany({});

    const now = new Date();

    // Upsert venues and build map from venueId -> _id
    const venueIdToObjectId = new Map();
    for (const v of selectedVenues) {
      const doc = await Venue.findOneAndUpdate(
        { venueId: v.id },
        {
          name: v.name,
          latitude: v.latitude,
          longitude: v.longitude,
          region: classifyRegion(v.latitude, v.longitude), // <- set region here
          lastUpdated: now
        },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );
      venueIdToObjectId.set(v.id, doc._id);
    }

    // Insert events, link to venues
    const venueToEventObjectIds = new Map();
    for (const ev of selectedEvents) {
      const venueObjId = venueIdToObjectId.get(ev.venueId);
      if (!venueObjId) continue;

      const eDoc = await Event.findOneAndUpdate(
        { eventId: ev.id },
        {
          title: ev.title,
          venue: venueObjId,
          description: ev.description,
          presenter: ev.presenter,
          dateTime: ev.dateTime,
          lastUpdated: now
        },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );

      if (!venueToEventObjectIds.has(ev.venueId)) venueToEventObjectIds.set(ev.venueId, []);
      venueToEventObjectIds.get(ev.venueId).push(eDoc._id);
    }

    // Update Venue.events arrays (set, not addToSet)
    await Promise.all(
      Array.from(venueToEventObjectIds.entries()).map(([venueId, evIds]) =>
        Venue.findOneAndUpdate(
          { venueId },
          { $set: { events: evIds }, lastUpdated: now }
        )
      )
    );

    // Save global lastUpdated
    await Meta.findOneAndUpdate(
      { key: 'dataImport' },
      { value: { lastImportedAt: now }, updatedAt: now },
      { upsert: true }
    );

    console.log('[Import] Completed successfully at', now.toISOString());
  } catch (err) {
    console.error('[Import] Failed:', err);
    throw err;
  }
}

// Initialize database with demo users
async function initializeDatabase() {
  try {
    console.log('Initializing database with demo users...');
    
    const demoUsers = [
      { username: 'user', password: 'user123', isAdmin: false },
      { username: 'admin', password: 'admin123', isAdmin: true }
    ];

    for (const userData of demoUsers) {
      const existingUser = await User.findOne({ username: userData.username });
      
      if (!existingUser) {
        const hashedPassword = await bcrypt.hash(userData.password, 10);
        const user = new User({
          username: userData.username,
          password: hashedPassword,
          isAdmin: userData.isAdmin
        });
        
        await user.save();
        console.log(`Created ${userData.isAdmin ? 'admin' : 'user'}: ${userData.username}`);
      } else {
        console.log(`User ${userData.username} already exists`);
      }
    }
    
    console.log('Database initialization completed');
  } catch (error) {
    console.error('Database initialization error:', error);
  }
}

// Serve the main HTML file for all routes (SPA)
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start server
app.listen(PORT, async () => {
  console.log(`Server running on http://localhost:${PORT}`);
  
  // Initialize database on startup
  await initializeDatabase();
});

module.exports = app;