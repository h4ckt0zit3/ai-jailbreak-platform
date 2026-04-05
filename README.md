# 🔒 SecureBot Jailbreak Challenge

A premium AI safety educational challenge for university tech fests. Teams compete to extract hidden secret codes from AI chatbots using prompt engineering techniques across 10 progressive difficulty rooms.

## 🚀 Quick Start

### Prerequisites
- Node.js 18+
- npm 9+

### Installation

```bash
# Install all dependencies (root + client)
npm run install:all
```

### Configuration

Edit `.env` file in the root directory:

```env
GROQ_API_KEY=your_groq_api_key   # Groq API key (uses llama-3.1-8b-instant)
ADMIN_KEY=JAIN2026ADMIN           # Admin dashboard access key
PORT=3000                         # Backend port
NODE_ENV=development              # Environment
```

### Development

```bash
# Start both frontend (port 5173) and backend (port 3000)
npm run dev
```

- Frontend: http://localhost:5173
- Backend API: http://localhost:3000
- Admin Dashboard: http://localhost:5173/admin?key=JAIN2026ADMIN

### Production

```bash
# Build frontend
npm run build

# Start with PM2 (cluster mode, 2 instances)
npm run start

# Or run directly
npm run server
```

## 📁 Project Structure

```
├── client/                    # React frontend (Vite + Tailwind)
│   ├── src/
│   │   ├── pages/
│   │   │   ├── Landing.jsx    # Registration page with particles & grid bg
│   │   │   ├── Rooms.jsx      # Room selection grid with mission progress
│   │   │   ├── Room.jsx       # Chat interface with attack arsenal sidebar
│   │   │   ├── LeaderboardPage.jsx  # Live rankings with podium
│   │   │   └── Admin.jsx      # Admin control panel
│   │   ├── api.js             # API client
│   │   ├── App.jsx            # Root component with routing
│   │   ├── main.jsx           # Entry point
│   │   └── index.css          # Design system (animations, effects, tokens)
│   ├── index.html
│   ├── tailwind.config.js
│   └── vite.config.js
├── server/
│   ├── index.js               # Express server (API routes)
│   ├── db.js                  # SQLite database (sql.js)
│   ├── ai.js                  # Groq API integration (llama-3.1-8b-instant)
│   └── prompts.js             # 10 room system prompts & win conditions
├── ecosystem.config.js        # PM2 config
├── .env                       # Environment variables
└── package.json
```

## 🎮 Features

### Core
- **10 Progressive Rooms**: Easy → Expert difficulty with unique secrets
- **AI-Powered**: Groq API with llama-3.1-8b-instant model
- **Scoring System**: 50–1000 points per room (3,650 total)
- **Attack Arsenal**: 8 pre-built jailbreak prompt templates
- **Hints System**: Buy hints for 20 pts each
- **Skip System**: Skip a room after 20 attempts
- **Live Leaderboard**: Real-time team rankings (auto-refresh)
- **Admin Dashboard**: Control game state, export CSV, view winning prompts
- **Session Persistence**: Progress saved via SQLite + localStorage

### UI/UX
- **Premium Dark Theme**: Deep space aesthetic with purple accent palette
- **Animated Grid Background**: Subtle cyber-grid overlay
- **Floating Orb Particles**: Ambient animated light effects
- **Glassmorphism Cards**: Frosted glass UI elements
- **Staggered Card Animations**: Room cards animate in sequentially
- **Glitch Text Effect**: Cyberpunk-style title animation
- **Scanline Overlay**: CRT monitor aesthetic on key panels
- **Micro-Animations**: Hover effects, progress bars, live-pulse indicators
- **Monospace Accents**: JetBrains Mono for counters & labels
- **Confetti Win Modal**: Celebration with falling particles
- **Mobile Responsive**: Collapsible sidebar, adaptive layouts

## 🏆 Scoring

| Action | Points |
|--------|--------|
| Solve Room 1 (Easy) | +50 |
| Solve Room 2 (Easy) | +100 |
| Solve Room 3 (Easy) | +150 |
| Solve Room 4 (Medium) | +200 |
| Solve Room 5 (Medium) | +250 |
| Solve Room 6 (Hard) | +300 |
| Solve Room 7 (Hard) | +400 |
| Solve Room 8 (Expert) | +500 |
| Solve Room 9 (Expert) | +700 |
| Solve Room 10 (Final Boss) | +1000 |
| Buy Hint | -20 |

## 🔑 API Routes

| Method | Route | Description |
|--------|-------|-------------|
| POST | `/api/register` | Register new team |
| POST | `/api/chat` | Send message to SecureBot |
| GET | `/api/progress/:id` | Get team progress |
| POST | `/api/hint` | Buy a hint |
| POST | `/api/skip` | Skip a room |
| GET | `/api/rooms` | Get all room info |
| GET | `/api/leaderboard` | Get top 10 teams |
| GET | `/api/admin/sessions` | All sessions (admin) |
| POST | `/api/admin/reset` | Reset all scores (admin) |
| POST | `/api/admin/toggle-game` | Toggle game active (admin) |
| GET | `/api/admin/game-state` | Get game state (admin) |
| GET | `/api/admin/winning-prompts` | View winning prompts (admin) |
| GET | `/api/admin/export-csv` | Export CSV (admin) |

## 🛡️ Security

- System prompts are **never** exposed to the frontend
- All AI interactions happen server-side
- Admin routes require key authentication
- Rate limiting (1 req / 2s per session)
- Input length validation (2000 char max)

## 📜 License

Built for educational purposes — Jain University Tech Fest 2026
