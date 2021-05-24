const express = require("express");
const socket = require("socket.io");
const join = require("path").join;
const url = require("url");
const app = express();
const ms = require("mediaserver");
require("dotenv").config();
const cors = require("cors");
app.use(cors());
const { nanoid } = require("nanoid");

var PORT = process.env.PORT || 5000;

app.use(express.static("public"));


const server = app.listen(PORT, () => {
	console.log(`Server running at ${PORT}`);
});

process.on("uncaughtException", (exception) => {
	console.log(exception);
});

const io = socket(server);

rooms = {};

const isAuthenticated = (req, res, next) => {
	const queryObject = url.parse(req.url, true).query;
	const curr_url = req.url.split("/");
	let roomno = curr_url[curr_url.length - 1];
	if (roomno.includes("?")) roomno = roomno.split("?")[0];

	
	if (!rooms.hasOwnProperty(roomno)) {
		return res.sendFile(join(__dirname, "public", "roomInvalid.html"));
	}

	if (queryObject.username) {
		return next();
	} else {
		return res.redirect(
			`https://syncex.herokuapp.com/?roomno=${roomno}`
		);
	}
};

app.get("/room/:roomno", isAuthenticated, (req, res) => {
	res.sendFile(join(__dirname, "public", "player.html"));
});

app.get("/getRoomNumber", (req, res) => {
	let roomno = nanoid(10);

	rooms[roomno] = {};
	rooms[roomno].array = [];

	setTimeout(
		(roomno) => {
			console.log(`Checking if someone has joined the room ${roomno}`);
			if (!rooms[roomno].hasJoined) {
				console.log(`Room ${roomno} killed since no joined the room`);
				delete rooms[roomno];
			}
		},
		60000,
		roomno
	);

	res.send(`${roomno}`);
});

app.get("/check/:roomno", (req, res) => {
	if (rooms.hasOwnProperty(req.params.roomno)) res.send(true);
	else res.send(false);
});

app.get("/getPlayerCSS", (_req, res) => {
	res.sendFile(join(__dirname, "public", "player.css"));
});

app.get("/getPlayerJS", (_req, res) => {
	res.sendFile(join(__dirname, "public", "player.js"));
});

app.get("/notifJoin.mp3", (req, res) => {
	ms.pipe(
		req,
		res,
		join(__dirname, "public", "notif_sounds", "notif_join.mp3")
	);
});
app.get("/notifChat.mp3", (req, res) => {
	ms.pipe(
		req,
		res,
		join(__dirname, "public", "notif_sounds", "notif_chat.mp3")
	);
});
app.get("/notifPermission.mp3", (req, res) => {
	ms.pipe(
		req,
		res,
		join(__dirname, "public", "notif_sounds", "notif_permission.mp3")
	);
});


io.on("connection", (socket,username) => {
	console.log(`Socket ${socket.id} is connected`);

	socket.on("ask permission", (roomno, username) => {
		console.log(`Socket ${socket.id} has asked to enter the room`);

		if (!rooms.hasOwnProperty(roomno)) socket.emit("room does not exist");
		else {
			if (rooms[roomno].array.length === 0)
				io.to(socket.id).emit("enter room", true);
			else {
				io.to(rooms[roomno].host).emit(
					"user permission",
					username,
					socket.id
				);
			}
		}
	});

	socket.on("isAllowed", (isAllowed, socketId) => {
		if (isAllowed) io.to(socketId).emit("enter room", true);
		else io.to(socketId).emit("enter room", false);
	});

	socket.on("joinroom", (roomno, username, peerId) => {
		console.log(`Socket ${socket.id} has joined the room`,'\n');
		socket.join(roomno);
		socket.to(roomno).emit("new user", username, peerId);

		socket.username = username;
		socket.roomno = roomno;
		socket.peerId = peerId;

		rooms[roomno].hasJoined = true; // A flag to check if someone has joined the room
		rooms[roomno].array.push({
			username,
			id: socket.id,
		});

		if (rooms[socket.roomno].array.length === 1) {
			rooms[socket.roomno].host = socket.id;
			rooms[socket.roomno].hostUsername = socket.username;
		}

		io.in(socket.roomno).emit(
			"user_array",
			rooms[socket.roomno].array.map((obj) => obj.username)
		);

		io.in(socket.roomno).emit(
			"current host",
			rooms[socket.roomno].hostUsername,
			rooms[socket.roomno].host
		);
	});

	socket.on("sync video", () => {
		io.to(rooms[socket.roomno].host).emit("get time from host", socket.id);
	});

	socket.on("video current state", (curr_time, isPlaying, socketId) => {
		io.to(socketId).emit("seeked", curr_time);
		if (isPlaying) io.to(socketId).emit("play");
		else io.to(socketId).emit("pause");
	});

	socket.on("New Message", (message, username, roomno) => {
		socket.to(roomno).emit("New Message", message, username);
	});

	socket.on("play", (roomno) => {
		socket.to(roomno).emit("play");
	});
	socket.on("pause", (roomno) => {
		socket.to(roomno).emit("pause");
	});
	socket.on("seeked", (data, roomno) => {
		socket.to(roomno).emit("seeked", data);
	});

	socket.on("disconnect", () => {
		console.log(`Socket ${socket.id} has left the room`,'\n');

		socket.to(socket.roomno).emit("left room", socket.username, socket.peerId);
		if (rooms.hasOwnProperty(socket.roomno) && rooms[socket.roomno].array) {
			
			rooms[socket.roomno].array.splice(
				rooms[socket.roomno].array.findIndex((x) => x.id === socket.id),
				1
			);

			if (
				rooms[socket.roomno].array.length > 0 &&
				rooms[socket.roomno].host === socket.id
			) {
				rooms[socket.roomno].host = rooms[socket.roomno].array[0].id;
				rooms[socket.roomno].hostUsername =
					rooms[socket.roomno].array[0].username;
				io.in(socket.roomno).emit(
					"current host",
					rooms[socket.roomno].hostUsername,
					rooms[socket.roomno].host
				);
			}

			socket.to(socket.roomno).emit(
				"user_array",
				rooms[socket.roomno].array.map((obj) => obj.username)
			);

			if (rooms[socket.roomno].array.length === 0) {
				setTimeout(
					(roomno) => {
						if (
							rooms.hasOwnProperty(roomno) &&
							rooms[roomno].array.length === 0
						) {
							delete rooms[roomno];
							console.log(`Room deleted ${roomno}`);
						}
					},
					600000,
					socket.roomno
				);
			}
		}
	});
});
