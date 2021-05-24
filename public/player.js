// New Peer
const peer = new Peer();

const notifChat = document.getElementById("notif_chat");
const notifJoin = document.getElementById("notif_join");
const notifPermission = document.getElementById("notif_permission");
const muteButton = document.getElementById("mute_toggle");
const speakerButton = document.getElementById("speaker_toggle");
const socket = io("https://syncex.herokuapp.com", {
	reconnect: false,
});

let curr_socketId;
let areYouHost = false;

let temp_arr = window.location.pathname.split("/");
var roomno = temp_arr[temp_arr.length - 1];

var current_username = new URLSearchParams(window.location.search).get(
	"username"
);

socket.on("connect", () => {
	curr_socketId = socket.id;

	socket.emit("ask permission", roomno, current_username);
});

let myPeerId;
peer.on("open", (id) => {
	myPeerId = id;
});
const peers = {};

window.onbeforeunload = () => {
	return "Are you sure?";
};

let room_URL = `https://syncex.herokuapp.com/room/${roomno}`;
let key=roomno;

document.getElementById("userDetail").innerText = current_username;

const navbarToggle = document.getElementsByClassName("navbar-toggler")[0];

socket.on("room does not exist", () => {
	window.location.href = "https://syncex.herokuapp.com";
});

socket.on("enter room", (isAllowed) => {
	if (isAllowed) {
		socket.emit("joinroom", roomno, current_username, myPeerId);
		document.getElementById("spinner").remove();
		document.getElementById("body-content").removeAttribute("hidden");
		document.getElementsByTagName("footer")[0].removeAttribute("hidden");
	}
	else window.location.href = "https://syncex.herokuapp.com";
});

let streamObj;
let audioTracks = [];
navigator.mediaDevices
	.getUserMedia({
		audio: true,
	})
	.then((stream) => {
		streamObj = stream;
		peer.on("call", (call) => {
			call.answer(stream);
			const newAudio = document.createElement("audio");
			call.on("stream", (userAudioStream) => {
				addAudioStream(newAudio, userAudioStream);
			});
		});

		socket.on("new user", (username, peerId) => {
			notifJoin.play();
			toastUserAddRemove(username, "joined");
			console.log(peerId);
			connectToNewUser(peerId, stream);
		});
	});

function connectToNewUser(userId, stream) {
	const call = peer.call(userId, stream);
	const audio = document.createElement("audio");
	call.on("stream", (userAudioStream) => {
		addAudioStream(audio, userAudioStream);
	});
	call.on("close", () => {
		audio.remove();
	});

	peers[userId] = call;
}

function addAudioStream(audio, stream) {
	audio.srcObject = stream;
	audio.addEventListener("loadedmetadata", () => {
		audio.play();
		audio.muted = !isSpeakerOn;
	});
	audioTracks.push(audio);
}

const muteIcon = muteButton.childNodes[1];
function muteToggle() {
	streamObj.getAudioTracks()[0].enabled ^= 1;
	if (streamObj.getAudioTracks()[0].enabled) {
		muteButton.style.backgroundColor = "#181a1b";
		muteIcon.classList.remove("fa-microphone-slash");
		muteIcon.classList.add("fa-microphone");
	} else {
		muteButton.style.backgroundColor = "red";
		muteIcon.classList.remove("fa-microphone");
		muteIcon.classList.add("fa-microphone-slash");
	}
}

const speakerIcon = speakerButton.childNodes[1];
let isSpeakerOn = true;
function speakerToggle() {
	isSpeakerOn = !isSpeakerOn;
	audioTracks.map((audio) => (audio.muted = !isSpeakerOn));
	if (!isSpeakerOn) {
		speakerButton.style.backgroundColor = "red";
		speakerIcon.classList.remove("fa-volume-up");
		speakerIcon.classList.add("fa-volume-off");
	} else {
		speakerButton.style.backgroundColor = "#181a1b";
		speakerIcon.classList.remove("fa-volume-off");
		speakerIcon.classList.add("fa-volume-up");
	}
}

askingPermissionUsers = [];

function permissionSpliceAndCheckPermission(isAllowed) {
	socket.emit("isAllowed", isAllowed, askingPermissionUsers[0].socketId);
	askingPermissionUsers.splice(0, 1);
	if (askingPermissionUsers.length !== 0) {
		setTimeout(() => {
			Utility();
		}, 500);
	}
}

document.getElementById("accept-btn").onclick = () => {
	permissionSpliceAndCheckPermission(true);
};

document.getElementById("decline-btn").onclick = () => {
	permissionSpliceAndCheckPermission(false);
};

socket.on("user permission", (username, socketId) => {
	notifPermission.play();
	askingPermissionUsers.push({ username, socketId });
	setTimeout(() => {
		Utility();
	}, 500);
});

function Utility() {
	document.getElementById(
		"modal-body"
	).innerText = `${askingPermissionUsers[0].username} wants to join the room`;

	$("#exampleModal").modal({
		backdrop: "static",
		keyboard: false,
	});
	$("#exampleModal").modal("show");
}

socket.on("get time from host", (socketId) => {
	socket.emit(
		"video current state",
		video.currentTime,
		!video.paused,
		socketId
	);
});

function syncVideo() {
	socket.emit("sync video");
	if (window.innerWidth < 995) navbarToggle.click();
}
function copyRoomNo() {
	let para = document.createElement("textarea");
	para.id = "copiedLink";
	para.value = key;
	document.body.appendChild(para);
	let ele = document.getElementById("copiedLink");
	ele.select();
	document.execCommand("copy"); 		//copies to the clipboard
	document.body.removeChild(para);
	if (window.innerWidth < 995) navbarToggle.click();
}

let URL = window.URL || window.webkitURL;

const video_HTML = document.getElementById("video");

const addVideoFile = function (_event) {
	let file = this.files[0];
	let fileURL = URL.createObjectURL(file);
	document.getElementById("video").src = fileURL;
	if (!areYouHost) syncVideo();
};
const addCaptionFile = function (_event) {
	let file = this.files[0];
	let fileURL = URL.createObjectURL(file);
	document.getElementById("video_track").setAttribute("src", fileURL);
};

document
	.getElementById("video_input")
	.addEventListener("change", addVideoFile, false);
document
	.getElementById("caption_input")
	.addEventListener("change", addCaptionFile);


video.onplaying = (event) => {
	if (areYouHost) {
		socket.emit("play", roomno);
		socket.emit("seeked", video.currentTime, roomno);
	}
};


video.onpause = (event) => {
	if (areYouHost) {
		socket.emit("pause", roomno);
	}
};


video.onseeked = (event) => {
	if (areYouHost) {
		let was_video_playing = !video.paused;
		socket.emit("seeked", video.currentTime, roomno);
		if (was_video_playing) socket.emit("play", roomno);
	}
};

socket.on("play", () => {
	video.play();
});


socket.on("pause", () => {
	video.pause();
});


socket.on("seeked", (data) => {
	let was_video_playing = !video.paused;
	video.currentTime = data;
	if (was_video_playing) video.play();
});

socket.on("user_array", (user_array) => {
	document.getElementById("no_of_members").innerText = user_array.length;
	let sidePanel = document.getElementById("sidePanel");
	sidePanel.innerHTML = "";
	user_array.map((users) => {
		let a_tag = document.createElement("a");
		let node = document.createTextNode(users);
		a_tag.classList.add("dropdown-item");
		a_tag.style.color = "white";
		a_tag.style.backgroundColor = "transparent";
		a_tag.style.opacity = "1";
		a_tag.appendChild(node);
		sidePanel.appendChild(a_tag);
	});
});

socket.on("current host", (username, hostID) => {
	if (curr_socketId == hostID) areYouHost = true;
	else areYouHost = false;
	document.getElementById("hostDetail").innerText = username;
});


const inputField = document.getElementById("inputField");
const sendMessageButton = document.getElementById("sendbutton");
let chatPanel = document.getElementById("chatpanel");
let chatIsHidden = true;
let chatButton = document.getElementById("chat_button");
let videoCol = document.getElementById("videoCol");
let chatCol = document.getElementById("chatCol");
const chatbody = document.getElementById("chatbody");

function checkempty() {
	if (inputField.value.trim() == "") {
		sendMessageButton.disabled = true;
	} else {
		sendMessageButton.disabled = false;
	}
}

function sendmessage() {
	chatbody.innerHTML += `
	<div class="col-sm-12 my-auto">
			<div
				class="float-right p-2 mt-2"
				style="
					background-color: #343a40;
					color: white;
					border-radius: 15px 15px 0px 15px;
					max-width: 200px;
					min-width: 100px;
				"
			>
				<div class="float-left">
					<b>You</b>
                </div>
            </br>
				<div>${inputField.value}</div>
				<div class="float-right">${new moment().format("h:mm a")}</div>
			</div>
		</div>`;

	socket.emit("New Message", inputField.value, current_username, roomno);
	let objDiv = chatPanel;
	objDiv.scrollTop = objDiv.scrollHeight;
	inputField.value = "";
	sendMessageButton.disabled = true;
}

socket.on("New Message", (message, username) => {
	if (chatIsHidden) notifChat.play();
	chatbody.innerHTML += `
		<div class="col-sm-12 my-auto">
			<div
				class="float-left p-2 mt-2"
				style="
					background-color: #c0c0c0;
					color: #000000;
					border-radius: 15px 15px 15px 0px;
					max-width: 200px;
					min-width: 100px;
				"
			>
                <div class="float-left"><b>${username}</b></div>
                </br>
				<div class="mt-1">${message}</div>
				<div class="float-right">${new moment().format("h:mm a")}</div>
			</div>
		</div>`;

	let objDiv = chatPanel;
	objDiv.scrollTop = objDiv.scrollHeight;
	let x = document.getElementById("chatRoom");
	if (chatIsHidden == true) {
		chatButton.style.backgroundColor = "#181a1b";
		if (!chatButton.innerHTML.endsWith("*")) chatButton.innerHTML += "*";
	}
});

function chatToggle() {
	setTimeout(() => {
		if (chatIsHidden) {
			chatCol.removeAttribute("hidden");
			chatIsHidden = false;
		} else {
			chatIsHidden = true;
		}
	}, 400);

	if (chatIsHidden) {
		chatButton.style.backgroundColor = "transparent";
		chatButton.innerHTML = chatButton.innerHTML.replace("*", "");
		videoCol.classList.remove("col-md-12");
		videoCol.classList.add("col-md-8");
	} else {
		videoCol.classList.remove("col-md-8");
		videoCol.classList.add("col-md-12");
		chatCol.setAttribute("hidden", "hidden");
	}
}

function chatRoom() {
	chatToggle();
	if (window.innerWidth < 995) navbarToggle.click();
}


let toastContainer = document.getElementById("toast-container");


socket.on("left room", (username, peerId) => {
	if (peers[peerId]) peers[peerId].close();
	toastUserAddRemove(username, "left");
});

function toastUserAddRemove(username, eventHappened) {
	toastContainer.style.padding = "10px";
	toastContainer.style.backgroundColor = "#181a1b";
	toastContainer.style.opacity = "0.8";
	toastContainer.style.borderRadius = "8px";
	toastContainer.innerHTML += `<div class="toast" data-autohide="false">
					<div class="toast-header">
						<svg
							class="rounded mr-2 ml-2"
							width="20"
							height="20"
							xmlns="http://www.w3.org/2000/svg"
							preserveAspectRatio="xMidYMid slice"
							focusable="false"
							role="img"
						>
							<rect fill="#007aff" width="100%" height="100%" />
						</svg>
						<strong class="mr-auto" style="color:white">Notification</strong>
					</div>
					<div class="toast-body ml-2 mb-3" style="color:white">
						${username} has ${eventHappened} the room.
					</div>
				</div>`;
	setTimeout(() => {
		toastContainer.innerHTML = "";
		toastContainer.style.padding = "0px";
	}, 5000);
}

document.onkeypress = function (e) {
	if (e.keyCode == 13 && inputField.value.trim() != "") {
		sendMessageButton.onclick();
	}
};
