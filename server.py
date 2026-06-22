import http.server
import socketserver
import json
import random
import socket
import sys
import urllib.parse
import urllib.request
import re
import http.cookiejar
import time
import os

PORT = 8000

# Global room store
# roomId -> room_data
rooms = {}

def get_local_ip():
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        # doesn't even have to be reachable
        s.connect(('10.255.255.255', 1))
        IP = s.getsockname()[0]
    except Exception:
        IP = '127.0.0.1'
    finally:
        s.close()
    return IP

def generate_code():
    return "".join(random.choices("0123456789", k=4))

# Cleanup old rooms (inactive for more than 2 hours)
def cleanup_rooms():
    now = time.time()
    to_delete = []
    for r_id, r in rooms.items():
        if now - r.get("lastActive", 0) > 7200:
            to_delete.append(r_id)
    for r_id in to_delete:
        del rooms[r_id]

class GameRequestHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        # Serve from 'public' folder
        super().__init__(*args, directory=os.path.join(os.path.dirname(__file__), "public"), **kwargs)

    def log_message(self, format, *args):
        # Suppress noisy HTTP requests logs, only print errors or manual logs
        pass

    def send_json_response(self, status_code, data):
        self.send_response(status_code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "POST, GET, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()
        self.wfile.write(json.dumps(data).encode("utf-8"))

    def do_OPTIONS(self):
        # Support CORS preflight
        self.send_response(200)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "POST, GET, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    def do_POST(self):
        cleanup_rooms()
        parsed_url = urllib.parse.urlparse(self.path)
        path = parsed_url.path

        if not path.startswith("/api/"):
            self.send_error(404, "Not Found")
            return

        # Read JSON body
        content_length = int(self.headers.get("Content-Length", 0))
        body = self.rfile.read(content_length).decode("utf-8") if content_length > 0 else "{}"
        try:
            data = json.loads(body) if body else {}
        except Exception:
            self.send_json_response(400, {"error": "Invalid JSON"})
            return

        room_id = data.get("roomId")
        player_id = data.get("playerId")

        # 1. CREATE ROOM
        if path == "/api/create":
            r_id = generate_code()
            while r_id in rooms:
                r_id = generate_code()
            pin = generate_code()
            
            host_id = "p_" + generate_code()
            host_name = data.get("playerName", "Host").strip() or "Host"
            
            rooms[r_id] = {
                "roomId": r_id,
                "pin": pin,
                "hostId": host_id,
                "serverIp": get_local_ip(),
                "state": "lobby", # lobby, setup, playing, finished
                "theme": "",
                "assignmentMode": "random", # random, curated
                "googleApiKey": "",
                "googleCx": "",
                "players": {
                    host_id: {
                        "id": host_id,
                        "name": host_name,
                        "characterName": None,
                        "characterImage": None,
                        "targetPlayerId": None,
                        "assignedCharacterName": None,
                        "assignedCharacterImage": None,
                        "status": "waiting", # waiting, ready, guessing, guessed, gave_up, quit
                        "guessTime": None
                    }
                },
                "guessOrder": [],
                "lastActive": time.time()
            }
            self.send_json_response(200, {
                "roomId": r_id,
                "pin": pin,
                "playerId": host_id,
                "playerName": host_name
            })
            return

        # 2. JOIN ROOM
        if path == "/api/join":
            join_room_id = data.get("roomId", "").strip()
            join_pin = data.get("pin", "").strip()
            player_name = data.get("playerName", "").strip() or "Player"

            if join_room_id not in rooms:
                self.send_json_response(404, {"error": "Room not found"})
                return
            
            room = rooms[join_room_id]
            if room["pin"] != join_pin:
                self.send_json_response(403, {"error": "Incorrect PIN"})
                return

            if room["state"] != "lobby":
                self.send_json_response(403, {"error": "Game already in progress"})
                return

            new_player_id = "p_" + generate_code()
            room["players"][new_player_id] = {
                "id": new_player_id,
                "name": player_name,
                "characterName": None,
                "characterImage": None,
                "targetPlayerId": None,
                "assignedCharacterName": None,
                "assignedCharacterImage": None,
                "status": "waiting",
                "guessTime": None
            }
            room["lastActive"] = time.time()
            
            self.send_json_response(200, {
                "roomId": join_room_id,
                "playerId": new_player_id,
                "playerName": player_name
            })
            return

        # 2b. SEARCH IMAGES (DuckDuckGo Proxy)
        if path == "/api/search_images":
            query = data.get("query", "").strip()
            if not query:
                self.send_json_response(200, [])
                return
            
            try:
                cj = http.cookiejar.CookieJar()
                opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(cj))
                
                headers = {
                    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
                    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
                    "Accept-Language": "en-US,en;q=0.5"
                }
                prime_url = f"https://duckduckgo.com/?q={urllib.parse.quote(query)}"
                req = urllib.request.Request(prime_url, headers=headers)
                
                with opener.open(req, timeout=5) as res:
                    html = res.read().decode('utf-8')
                
                match = re.search(r'vqd\s*=\s*[\'"]([^\'"]+)[\'"]', html)
                if not match:
                    match = re.search(r'vqd\s*:\s*[\'"]([^\'"]+)[\'"]', html)
                
                if not match:
                    self.send_json_response(200, [])
                    return
                
                vqd = match.group(1)
                
                headers_images = {
                    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
                    "Accept": "application/json, text/javascript, */*; q=0.01",
                    "Accept-Language": "en-US,en;q=0.5",
                    "Referer": f"https://duckduckgo.com/?q={urllib.parse.quote(query)}",
                    "X-Requested-With": "XMLHttpRequest"
                }
                image_url = f"https://duckduckgo.com/i.js?l=wt-wt&o=json&q={urllib.parse.quote(query)}&vqd={vqd}&f=,,,&p=1"
                req2 = urllib.request.Request(image_url, headers=headers_images)
                
                with opener.open(req2, timeout=5) as res2:
                    res_data = json.loads(res2.read().decode('utf-8'))
                
                raw_results = res_data.get("results", [])
                results = []
                for item in raw_results[:25]:
                    results.append({
                        "title": item.get("title", "Image"),
                        "image": item.get("image"),
                        "thumbnail": item.get("thumbnail")
                    })
                self.send_json_response(200, results)
            except Exception as e:
                self.send_json_response(200, [])
            return

        # Verify Room Exists for subsequent endpoints
        if not room_id or room_id not in rooms:
            self.send_json_response(404, {"error": "Room not found"})
            return
        
        room = rooms[room_id]
        room["lastActive"] = time.time()

        # 3. POLL STATE
        if path == "/api/poll":
            if player_id not in room["players"]:
                self.send_json_response(401, {"error": "Player not in room"})
                return
            self.send_json_response(200, room)
            return

        # 4. UPDATE SETTINGS (Host only)
        if path == "/api/update_settings":
            if player_id != room["hostId"]:
                self.send_json_response(403, {"error": "Only the host can modify settings"})
                return
            
            mode = data.get("assignmentMode")
            if mode in ["random", "curated"]:
                room["assignmentMode"] = mode
            self.send_json_response(200, room)
            return

        # 5. START GAME (Host only)
        if path == "/api/start_game":
            if player_id != room["hostId"]:
                self.send_json_response(403, {"error": "Only the host can start the game"})
                return
            
            theme = data.get("theme", "").strip() or "Any Character"
            room["theme"] = theme
            
            # Save Google Custom Search API credentials from Host config
            room["googleApiKey"] = data.get("googleApiKey", "").strip()
            room["googleCx"] = data.get("googleCx", "").strip()
            
            room["state"] = "setup"
            
            # Reset player variables for setup
            for p in room["players"].values():
                p["characterName"] = None
                p["characterImage"] = None
                p["targetPlayerId"] = None
                p["assignedCharacterName"] = None
                p["assignedCharacterImage"] = None
                p["status"] = "waiting"
                p["guessTime"] = None
            
            room["guessOrder"] = []
            self.send_json_response(200, room)
            return

        # 6. SUBMIT CHARACTER
        if path == "/api/submit_character":
            if player_id not in room["players"]:
                self.send_json_response(401, {"error": "Player not in room"})
                return
            
            char_name = data.get("characterName", "").strip()
            char_image = data.get("characterImage", "").strip()
            
            if not char_name or not char_image:
                self.send_json_response(400, {"error": "Character name and image are required"})
                return

            player = room["players"][player_id]
            player["characterName"] = char_name
            player["characterImage"] = char_image
            player["status"] = "ready"

            # Random Mode submission
            if room["assignmentMode"] == "random":
                # Check if all players have submitted
                all_ready = all(p["status"] == "ready" for p in room["players"].values())
                if all_ready:
                    # Perform derangement shuffle
                    self.assign_random_characters(room)
                    room["state"] = "playing"
                    for p in room["players"].values():
                        p["status"] = "guessing"

            # Curated Mode submission
            else:
                target_id = data.get("targetPlayerId")
                if not target_id or target_id not in room["players"] or target_id == player_id:
                    self.send_json_response(400, {"error": "Invalid target player selected"})
                    return
                
                target_player = room["players"][target_id]
                target_player["assignedCharacterName"] = char_name
                target_player["assignedCharacterImage"] = char_image
                player["targetPlayerId"] = target_id
                
                # In curated, game starts when everyone has an assigned character
                all_assigned = all(p["assignedCharacterName"] is not None for p in room["players"].values())
                if all_assigned:
                    room["state"] = "playing"
                    for p in room["players"].values():
                        p["status"] = "guessing"

            self.send_json_response(200, room)
            return

        # 7. UPDATE PLAY STATUS
        if path == "/api/update_status":
            if player_id not in room["players"]:
                self.send_json_response(401, {"error": "Player not in room"})
                return
            
            status = data.get("status")
            if status not in ["guessing", "guessed", "gave_up", "quit"]:
                self.send_json_response(400, {"error": "Invalid status"})
                return
            
            player = room["players"][player_id]
            player["status"] = status
            
            # If guessed, record order
            if status == "guessed" and player_id not in room["guessOrder"]:
                player["guessTime"] = time.time()
                room["guessOrder"].append(player_id)
            
            # If they quit, we might remove them from the guess order if they were in it
            if status == "quit" and player_id in room["guessOrder"]:
                room["guessOrder"].remove(player_id)
            
            # Check if game is over (everyone has guessed, gave_up, or quit)
            game_over = all(p["status"] in ["guessed", "gave_up", "quit"] for p in room["players"].values())
            if game_over:
                room["state"] = "finished"

            self.send_json_response(200, room)
            return

        # 8. REMOVE PLAYER (Host only)
        if path == "/api/remove_player":
            if player_id != room["hostId"]:
                self.send_json_response(403, {"error": "Only the host can kick players"})
                return
            
            kick_id = data.get("kickPlayerId")
            if kick_id in room["players"]:
                # If host kicks themselves, we don't allow it, or destroy room
                if kick_id == room["hostId"]:
                    self.send_json_response(400, {"error": "Host cannot be kicked"})
                    return
                del room["players"][kick_id]
                if kick_id in room["guessOrder"]:
                    room["guessOrder"].remove(kick_id)
                
                # Check if game finishes as a result of player count change
                if room["state"] in ["setup", "playing"]:
                    all_ready_or_done = all(
                        p["status"] in ["ready", "guessed", "gave_up", "quit"]
                        for p in room["players"].values()
                    )
                    if room["state"] == "setup" and all(p["status"] == "ready" for p in room["players"].values()):
                        if room["assignmentMode"] == "random":
                            self.assign_random_characters(room)
                            room["state"] = "playing"
                            for p in room["players"].values():
                                p["status"] = "guessing"
                    elif room["state"] == "playing" and all_ready_or_done:
                        room["state"] = "finished"

            self.send_json_response(200, room)
            return

        # 9. RESET GAME (Host only)
        if path == "/api/reset_game":
            if player_id != room["hostId"]:
                self.send_json_response(403, {"error": "Only the host can reset the game"})
                return
            
            room["state"] = "lobby"
            room["theme"] = ""
            room["guessOrder"] = []
            
            # Reset player states back to lobby defaults
            for p in room["players"].values():
                p["characterName"] = None
                p["characterImage"] = None
                p["targetPlayerId"] = None
                p["assignedCharacterName"] = None
                p["assignedCharacterImage"] = None
                p["status"] = "waiting"
                p["guessTime"] = None
                
            self.send_json_response(200, room)
            return

        # 10. END ROOM (Host only)
        if path == "/api/end_room":
            if player_id != room["hostId"]:
                self.send_json_response(403, {"error": "Only the host can end the room"})
                return
            
            if room_id in rooms:
                del rooms[room_id]
            self.send_json_response(200, {"success": True})
            return

        self.send_error(404, "Not Found")

    def assign_random_characters(self, room):
        players_list = list(room["players"].values())
        n = len(players_list)
        if n < 1:
            return
        if n == 1:
            # Single player corner case: assign own character
            p = players_list[0]
            p["assignedCharacterName"] = p["characterName"]
            p["assignedCharacterImage"] = p["characterImage"]
            return

        # List of characters submitted
        chars = [{"name": p["characterName"], "image": p["characterImage"], "creatorId": p["id"]} for p in players_list]
        
        # Try to find a valid derangement (nobody gets their own character)
        max_attempts = 1000
        for _ in range(max_attempts):
            shuffled = chars.copy()
            random.shuffle(shuffled)
            
            valid = True
            for i in range(n):
                if players_list[i]["id"] == shuffled[i]["creatorId"]:
                    valid = False
                    break
            
            if valid:
                for i in range(n):
                    players_list[i]["assignedCharacterName"] = shuffled[i]["name"]
                    players_list[i]["assignedCharacterImage"] = shuffled[i]["image"]
                return

        # Simple shift-by-1 fallback if derangement shuffling fails (unlikely, but guaranteed to be valid derangement for n > 1)
        for i in range(n):
            target_char = chars[(i + 1) % n]
            players_list[i]["assignedCharacterName"] = target_char["name"]
            players_list[i]["assignedCharacterImage"] = target_char["image"]

def run():
    # Make sure 'public' directory exists
    public_dir = os.path.join(os.path.dirname(__file__), "public")
    if not os.path.exists(public_dir):
        os.makedirs(public_dir)

    local_ip = get_local_ip()
    print("==================================================")
    print("      GUESS THE CHARACTER GAME SERVER             ")
    print("==================================================")
    print(f"Local Server running at: http://localhost:{PORT}")
    print(f"LAN Server running at:   http://{local_ip}:{PORT}")
    print("==================================================")
    print("Make sure your phone is connected to the same Wi-Fi")
    print("network as this computer to join the game!")
    print("==================================================")
    
    server_address = ("", PORT)
    socketserver.ThreadingTCPServer.allow_reuse_address = True
    with socketserver.ThreadingTCPServer(server_address, GameRequestHandler) as httpd:
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\nShutting down server...")
            sys.exit(0)

if __name__ == "__main__":
    run()
