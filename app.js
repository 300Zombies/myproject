const express = require("express");
const app = express();
const bodyParser = require("body-parser");
const mysql = require("./util/mysqlcon.js");
const server = app.listen(3000, () => {
    console.log("listening on port 3000");
});
const request = require("request");
const io = require("socket.io").listen(server);

app.use(express.static("public"));

app.use(bodyParser.urlencoded({ // urlencoded is <form>'s default data type
    extended: false
}));
app.use(bodyParser.json()); // now body-parser can parse <form>'s json

// io.on('connection', function(socket){
//     socket.emit('request', /* */); // emit an event to the socket
//     io.emit('broadcast', /* */); // emit an event to all connected sockets
//     socket.on('reply', function(){ /* */ }); // listen to the event
//   });

// game object
class Game {
    constructor() {
        this.on = false;
        this.players = [];
        this.last = "";
        this.next = "";
        this.winner = "";
        this.topicPool = [];
        this.topic = "";
        this.timer = "";
        this.interval = "";
        this.guessed = 0;
        this.now = 0;
        this.finished = false;
    }
    add(player) {
        this.players.push(player)
    }
    shuffle(arr) {
        for (let i = arr.length - 1; i > 0; i--) {
            let j = Math.floor(Math.random() * (i + 1));
            [arr[i], arr[j]] = [arr[j], arr[i]];
        }
    }
    topicPair(arr) {
        let topic = arr.splice(0, 2);
        return topic
    }
    countdown(milsec, cb) {
        // this.interval = setInterval(() => {
        //     game.now++;
        // }, 1000);
        console.log(`${milsec/1000}s timer`);
        this.timer = setTimeout(() => {
            cb();
        }, milsec);
    }
}
// player object
class Player {
    constructor(name, picture, id) {
        this.name = name;
        this.id = id;
        this.score = 0;
        this.drawing = false;
        // this.haveDrawn = false;
        this.picture = picture;
    }
}
let game = new Game();
app.post("/login/facebook", (req, res) => {
    const fbToken = req.body.token;
    const url = `https://graph.facebook.com/me?fields=id,name,picture.width(160).height(160)&access_token=${fbToken}`;
    request(url, (error, response, body) => {
        if (!error && response.statusCode == 200) {
            const fbName = JSON.parse(body).name;
            const fbPicture = JSON.parse(body).picture.data.url;
            res.json({
                name: fbName,
                picture: fbPicture
            });
        } else {
            console.log(error)
        }
    });
});
app.get("/knockknock", (req, res) => {
    // TODO: check if name duplicated
    if (game.players.length < 7) {
        res.send({
            message: `還有 ${7 - game.players.length} 個位置`
        });
    } else {
        res.send({
            message: "沒有位置了"
        });
    }
});
io.on("connection", (socket) => {
    console.log("a user connected");
    socket.on("join room", (player) => {
        game.players.push(new Player(player.name, player.picture, socket.id));
        let i = game.players.findIndex((e) => { // find drawer
            return e.drawing === true
        });
        if (i === -1) { // no drawer
            game.players[0].drawing = true; // first player is drawer
            socket.emit("show game start"); // info control
        } else {
            socket.emit("show wait for start");
        }
        // socket.emit("synchronize canvas re"); // TODO:
        // socket.emit("synchronize timebar"); // TODO:
        io.emit("render players re", game.players);
    });
    socket.on("chat message", (player) => { // ok
        // check current player number every chat event
        let msg;
        if (game.on && player.answer === game.topic) { // check if hit
            // hit and calculate score
            let i = game.players.findIndex((e) => { // e === elements
                return e.id === socket.id
            });
            game.players[i].score += 35;
            socket.emit("you hit");
            io.emit("update score", game.players);
            msg = `${player.name}猜對了!!`;
            game.guessed += 1;
            // over 100 and masterpiece
            let result = game.players.filter((player) => {
                return player.score >= 100;
            });
            if (result.length > 0) {
                game.finished = true;
                game.winner = result.reduce((prev, curr) => { // Ted
                    return prev.score > curr.score ? prev : curr
                });
            }
            if (game.guessed === game.players.length - 1) { // masterpiece event
                clearTimeout(game.timer); // end drawing phase
                let i = game.players.findIndex((e) => {
                    return e.drawing === true;
                });
                game.players[i].drawing = false;

                if (i + 1 === game.players.length) {
                    game.players[0].drawing = true;
                    game.next = game.players[0];
                    io.to(game.players[0].id).emit("time up");
                } else {
                    game.players[i + 1].drawing = true;
                    game.next = game.players[i + 1];
                    io.to(game.players[i + 1].id).emit("time up");
                }
                let expired = Date.now() + (10 * 1000);
                io.emit("frontend timer", expired);
                io.emit("block canvas and chat");
                io.emit("hide canvas panel");
                io.emit("masterpiece", game.next);
                game.guessed = 0;
                return
            }
        } else {
            msg = `${player.name}: ${player.answer}`;
        }
        io.emit("chat message", msg);
    });
    socket.on("disconnect", () => { // TODO: incomplete
        if (game.players.length === 0) {
            console.log(game.players)
            game.on = false;
        }
        console.log("is game on?", game.on);
        // player disconnect while game started, especially drawing persion
        console.log("user disconnected");
        // let i = players.findIndex(e => e.id === socket.id);
        let i = game.players.findIndex((e) => { // e === elements
            return e.id === socket.id
        });
        // update players and drawing status
        if (game.players[i].drawing === true) {
            // TODO:
            // clear canvas
            // show drawer leave
            // assign next drawer
            // let next drawer pick topic
            game.last = game.players[i];
            clearTimeout(game.timer);
            if (i + 1 === game.players.length) {
                game.players[0].drawing = true;
                game.next = game.players[0];
                io.to(game.players[0].id).emit("time up");
            } else {
                game.players[i + 1].drawing = true;
                game.next = game.players[i + 1];
                io.to(game.players[i + 1].id).emit("time up");
            }
            let expired = Date.now() + (10 * 1000);
            io.emit("frontend timer", expired);
            io.emit("block canvas and chat");
            io.emit("hide canvas panel");
            // io.emit("masterpiece", game.next);
            io.emit("player skipped", {
                last: game.last,
                next: game.next
            });
        }
        game.players.splice(i, 1);
        // send to everyone
        console.log(game.players)
        // let gameStatus = {
        //     on: game.on,
        //     now: game.now,
        //     players: game.players
        // }
        io.emit("update score", game.players);
        // prevent error
    });


    // canvas sync
    socket.on("canvas init", (msg) => { // ok
        console.log(msg)
        // find current drawer
        let i = game.players.findIndex((e) => {
            return e.drawing === true;
        });
        console.log("current drawer socket id =", game.players[i].id);
        // send to current drawer
        io.to(game.players[i].id).emit("canvas init", "server resquesting canvas data");
    });


    //  TODO: under construction
    socket.on("fresh canvas", (img) => {
        console.log("socket.id request canvas", game.players[game.players.length - 1].id)
        // send to newcomer
        io.to(game.players[game.players.length - 1].id).emit("fresh canvas", img);
    });



    socket.on("drawing", (data) => {
        // emit to all socket BUT event sender
        socket.broadcast.emit("drawing", data);
    });
    socket.on("clear canvas", () => {
        socket.broadcast.emit("clear canvas");
    })
    socket.on("game start", async () => {
        // only host can init game start event
        // must have 2 up player to start
        // game object init
        game.on = true;
        game.guessed = 0;
        game.topicPool = await mysql.con(`select title from animals`);
        // map topicPool
        game.topicPool = game.topicPool.map((e) => {
            return e.title
        });
        game.shuffle(game.topicPool);
        console.log("let the games begin");
        let session = {
            topic: game.topicPair(game.topicPool),
            expired: Date.now() + (10 * 1000)
        }
        // emit topic pair to draw
        socket.emit("pick one", session.topic);
        // emit expired time to everyone
        io.emit("frontend timer", session.expired); // picking topic
    });
    socket.on("round start", () => {
        let topic = game.topicPair(game.topicPool);
        let expired = Date.now() + (10 * 1000)
        // let result = game.players.filter((player) => {
        //     return player.score >= 100;
        // });
        // // before round start check if there are 100+ points
        // if (result.length > 0) { // one or more player over 100 points
        //     let winner = result.reduce((prev, curr) => { // Ted
        //         return prev.score > curr.score ? prev : curr
        //     });
        //     // assign new drawer
        //     let i = game.players.findIndex((e) => {
        //         return e.drawing === true;
        //     });
        //     game.players[i].drawing = false;

        //     if (i + 1 === game.players.length) {
        //         game.players[0].drawing = true;
        //         // io.to(game.players[0].id).emit("time up");
        //     } else {
        //         game.players[i + 1].drawing = true;
        //         // io.to(game.players[i + 1].id).emit("time up");
        //     }
        //     // tell all clients show winner screen
        //     io.emit("winner", winner);
        //     io.emit("frontend timer", expired); // for winner screen
        //     // reset everyone's score to 0
        //     game.players.forEach((e) => {
        //         e.score = 0;
        //     });
        // } else { // no one over 100 points
        //     console.log("round start");
        //     // emit topic pair to drawer
        //     socket.emit("pick one", topic);
        //     // emit expired time to everyone
        //     io.emit("frontend timer", expired); // picking topic
        // }
        console.log("round start");
        // emit topic pair to drawer
        socket.emit("pick one", topic);
        // emit expired time to everyone
        io.emit("frontend timer", expired);
    });
    socket.on("pick 10 sec", () => {
        game.guessed = 0;
        // timer
        game.countdown(10 * 1000, () => {
            // console.log("player skipped timer 10s")
            // if timeout change drawing status next one pick topics
            console.log(socket.id, "has skipped the turn");
            let i = game.players.findIndex((e) => {
                return e.drawing === true;
            });
            // emit last and next to skipped screen
            game.last = game.players[i];
            game.players[i].drawing = false;
            if (i + 1 === game.players.length) {
                game.players[0].drawing = true;
                game.next = game.players[0];
                io.to(game.players[0].id).emit("time up");
            } else {
                game.players[i + 1].drawing = true;
                game.next = game.players[i + 1];
                io.to(game.players[i + 1].id).emit("time up");
            }
            let expired = Date.now() + (10 * 1000);
            io.emit("player skipped", {
                last: game.last,
                next: game.next
            }); // tell frontend do display work
            io.emit("frontend timer", expired); // init frontend timer
            // io.emit("update score", game.players);
            // console.log("update player stat", game.players);
        });
    });
    socket.on("topic picked", (theTopic) => {
        console.log("topic picked");
        clearTimeout(game.timer);
        console.log(theTopic);
        game.topic = theTopic;
        // clearInterval(game.interval);
        let expired = Date.now() + (30 * 1000);
        // send to drawer enable drawing and countdown
        socket.emit("start drawing", expired);
        socket.emit("show canvas panel");
        // send to others enable msg and start countdown
        socket.broadcast.emit("start guessing", expired);
        io.emit("frontend timer", expired); // draw and guess
    });
    socket.on("wait 10 sec", () => {
        if (game.finished) { // if true
            game.players.forEach((e) => {
                e.score = 0;
            });
            game.finished = false;
            game.countdown(10 * 1000, () => {
                // console.log("masterpiece timer 10s");
                let expired = Date.now() + (10 * 1000);
                io.emit("winner", {
                    next: game.next,
                    winner: game.winner
                }); // fronrend display
                io.emit("update score", game.players)
                io.emit("frontend timer", expired);
                socket.emit("time up");
            });
        } else {
            // after skipping screen, emit round end to drawer
            game.countdown(10 * 1000, () => {
                // console.log("pick topic timer 10s")
                // rebounce to backend timer pick 10 sec
                socket.emit("round end");
                // frontend display
                socket.broadcast.emit("guess end");
            });
        }
        // after skipping screen, emit round end to drawer
        // game.countdown(10 * 1000, () => {
        //     socket.emit("round end");
        //     socket.broadcast.emit("guess end");
        // });
    });
    socket.on("draw 60 sec", () => {
        // start drawing countdown
        game.countdown(30 * 1000, () => {
            // console.log("drawing over timer 60s")
            let i = game.players.findIndex((e) => {
                return e.drawing === true;
            });
            game.players[i].drawing = false;
            // assign next drawer
            if (i + 1 === game.players.length) {
                game.players[0].drawing = true;
                game.next = game.players[0];
                io.to(game.players[0].id).emit("time up");
            } else {
                game.players[i + 1].drawing = true;
                game.next = game.players[i + 1];
                io.to(game.players[i + 1].id).emit("time up");
            }
            let expired = Date.now() + (10 * 1000);
            io.emit("frontend timer", expired);
            // tell everyone player skipped and countdown 10 sec
            io.emit("show answer", {
                next: game.next,
                topic: game.topic
            });
            io.emit("block canvas and chat");
            io.emit("hide canvas panel");
        });
    });
});
// The Fisher–Yates shuffle
function shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
        let j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
}
// discarded
function assignDrawer(players) { // run twice to get 2 drawer for now/next
    // build array with players haven't draw 
    players.forEach((e) => {
        if (e.haveDrawn === false) {
            game.playerPool.push(e);
        }
    });
    // randomly pick one become drawer
    let i = Math.floor(Math.random() * game.playerPool.length);
    game.playerPool[i].drawing = true;
    // remove drawer to drawer array
    let drawer = game.playerPool.splice(i, 1);
    game.drawerPool.push(drawer);
}
// experiment
function stepOne(timeout) {
    console.log("step 1")
    setTimeout(() => {
        stepTwo(1000)
    }, timeout);
}

function stepTwo(timeout) {
    console.log("step 2")
    setTimeout(() => {
        stepThree(1000)
    }, timeout);
}

function stepThree(timeout) {
    console.log("step 3")
    setTimeout(() => {
        stepOne(1000)
    }, timeout);
}
// countdownLoop(1000, countdownLoop)
// testchat

// var numUsers = 0;

// io.on('connection', (socket) => {
//     var addedUser = false;

//     // when the client emits 'new message', this listens and executes
//     socket.on('new message', (data) => {
//         // we tell the client to execute 'new message'
//         socket.broadcast.emit('new message', {
//             username: socket.username,
//             message: data
//         });
//     });

//     // when the client emits 'add user', this listens and executes
//     socket.on('add user', (username) => {
//         if (addedUser) return;

//         // we store the username in the socket session for this client
//         socket.username = username;
//         ++numUsers;
//         addedUser = true;
//         socket.emit('login', {
//             numUsers: numUsers
//         });
//         // echo globally (all clients) that a person has connected
//         socket.broadcast.emit('user joined', {
//             username: socket.username,
//             numUsers: numUsers
//         });
//     });

//     // when the client emits 'typing', we broadcast it to others
//     socket.on('typing', () => {
//         socket.broadcast.emit('typing', {
//             username: socket.username
//         });
//     });

//     // when the client emits 'stop typing', we broadcast it to others
//     socket.on('stop typing', () => {
//         socket.broadcast.emit('stop typing', {
//             username: socket.username
//         });
//     });

//     // when the user disconnects.. perform this
//     socket.on('disconnect', () => {
//         if (addedUser) {
//             --numUsers;

//             // echo globally that this client has left
//             socket.broadcast.emit('user left', {
//                 username: socket.username,
//                 numUsers: numUsers
//             });
//         }
//     });
// });