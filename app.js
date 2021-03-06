"use strict";

let log = require('npmlog');
Object.defineProperty(log, 'heading', { get: () => { return '[' + new Date().toISOString().replace(/T/, ' ').replace(/\..+/, '') + ']' } });
log.headingStyle = { bg: '', fg: 'white' };

let app = require('express')();
let http = require('http').Server(app);
let io = require('socket.io')(http);
let port = process.env.PORT || 3000;

let Player = require('./models/player.js');

let mysql      = require('mysql');
let connectionDetails = {
    host     : 'mysql',
    user     : 'graddlerwars',
    password : 'graddlerwars',
    database : 'graddlerwars',
    charset  : "LATIN1"
};

app.get('/', function(req, res){
    res.sendFile(__dirname + '/web/index.html');
});

app.get('/master', function(req, res){
    if (!autoplay) {
        res.sendFile(__dirname + '/web/master.html');
    } else {
        res.sendFile(__dirname + '/web/index.html');
    }
});

app.get('/view', function(req, res){
    res.sendFile(__dirname + '/web/view.html');
});

app.get('/css', function(req, res){
    res.sendFile(__dirname + '/web/css/style.css');
});

app.get('/js', function(req, res){
    res.sendFile(__dirname + '/web/js/main.js');
});

//Config
let teams = [
    'Red',
    'Blue'
];
let categories = [
    '%'
];
let rounds = 10;
let defaultTime = 20;
let scoreboardTime = 20;
let autoplay = true;
let autoplayTime = 3;
let autoplayStartTime = 30;
//---------

let players = {};
let teamPoints = {};
let count = {};
let currentQuestionRow = [];
let currentRound = 0;
let timeRemaining = 0;
let isGameRunning = false;
let isRoundRunning = false;
let playersOnline = 0;
let autoplayStarting = false;

io.on('connection', function(socket) {
    log.info('Socket', 'Socket ' + socket.id + ' connected!');
    prepareClient(socket);

    socket.on('login', function(data){
        data.name = data.name.toString().trim();
        if (data.name && teams.includes(data.team) && !isGameRunning) {
            players[socket.id].name = data.name;
            players[socket.id].team = data.team;
            playersOnline++;

            log.info('Socket', 'Socket ' + socket.id + ' logged in with name ' +  data.name + ' and team ' +  data.team);
            log.info('Players', playersOnline + ' players online!');
            socket.emit('login_success', {name: data.name, team: data.team});

            if (autoplay) {
                startAutoplayTimer();
            }
        }
    });

    socket.on('click', function(letter){
        if (isRoundRunning && !players[socket.id].locked && players[socket.id].loggedIn) {
            count[letter]++;
            players[socket.id].locked = true;
            socket.emit('lock_answer', letter);

            if (currentQuestionRow.correct_answer.toLowerCase() === letter) {
                players[socket.id].points++;
                teamPoints[players[socket.id].team]++;
            }
        }
    });

    socket.on('start', function(){
        startGame();
    });

    socket.on('next_question', function(){
        nextQuestion();
    });

    socket.on('disconnect', function(){
        if (players[socket.id].loggedIn) {
            log.info('Socket', 'Socket ' + socket.id + ' (' + players[socket.id].name + ') disconnected!');
            playersOnline--;
            if (playersOnline < 1 && isGameRunning) {
                log.info('Game', 'Ending the game, because all players left the game');
                showScoreboardAndStopGame();
            }
            log.info('Players', playersOnline + ' players online!');
        } else {
            log.info('Socket', 'Socket ' + socket.id + ' disconnected!');
        }

        delete players[socket.id];
    });
});

let autoplayCounterTimer = null;
let autoplayTimer = 0;
function startAutoplayTimer() {
    log.info('Autoplay', 'Starting autoplay countdown');
    if (!autoplayStarting) {
        autoplayStarting = true;

        setTimeout(startAutoplay, autoplayStartTime * 1000);
        autoplayCounterTimer = setInterval(updateAutoplayCounter, 1000);
        autoplayTimer = autoplayStartTime;
    }
}

function updateAutoplayCounter() {
    autoplayTimer--;
    for (let socketid in players) {
        if (players[socketid].loggedIn) {
            io.to(socketid).emit('update_autoplay_timer', autoplayTimer);
            io.to(socketid).emit('update_player_counter', playersOnline);
        }
    }
}

function startAutoplay() {
    clearInterval(autoplayCounterTimer);
    autoplayStarting = false;

    if (playersOnline > 0) {
        log.info('Autoplay', 'Autoplay started');
        startGame();
    } else {
        log.info('Autoplay', 'Didn\'t start autoplay, because all players left the game');
    }
}

function startGame() {
    log.info('Game', 'Starting game');
    for (let socketid in io.sockets.sockets) {
        if (players[socketid].loggedIn) {
            io.to(socketid).emit('start', true);
        } else {
            io.to(socketid).emit('start', false);
        }
    }

    currentRound = 0;
    isGameRunning = true;
    nextQuestion();
}

function nextQuestion() {
    log.info('Game', 'Getting next question');
    for (let key in count) {
        count[key] = 0;
        io.emit('update_count', {letter: key, count: count[key]});
    }

    currentRound++;

    if (currentRound > rounds) {
        showScoreboardAndStopGame();
        return;
    }

    timeRemaining = defaultTime;
    isRoundRunning = true;

    let whereString = '';
    for (let i = 0; i < categories.length; i++) {
        whereString += (i === 0 ? ' ' : ' OR ') + 'category like ' + '"' + categories[i] + '"';
    }

    let connection = mysql.createConnection(connectionDetails);

    connection.query('SELECT * FROM questions WHERE' + whereString + ' ORDER BY RAND() LIMIT 1', function (error, results, fields) {
        if (error) throw error;

        currentQuestionRow = results[0];

        io.emit('update_round', currentRound + '/' + rounds);
        io.emit('update_timer', timeRemaining);
        io.emit('update_question', results[0].question);
        io.emit('update_answers', {
            a: results[0].answer_a,
            b: results[0].answer_b,
            c: results[0].answer_c,
            d: results[0].answer_d
        });

        for (let socketid in players) {
            players[socketid].locked = false;
        }
    });

    connection.end();

    log.info('Game', 'New round started');
}

function showScoreboardAndStopGame() {
    log.info('Game', 'Showing scoreboard and stopping the game');
    isRoundRunning = false;
    isGameRunning = false;
    currentRound = 0;

    let scoreboardTeams = {};
    for (let teamIndex in teams) {
        let name = teams[teamIndex];
        scoreboardTeams[name] = {};
        scoreboardTeams[name]['players'] = [];
    }

    for (let socketid in players) {
        let player = players[socketid];
        if (player.loggedIn) {
            scoreboardTeams[player.team]['players'].push({name: player.name, points: player.points});
        }
    }

    for (let teamIndex in teams) {
        let name = teams[teamIndex];
        let playerCount = Object.keys(scoreboardTeams[name]['players']).length;
        if (playerCount === 0) {
            scoreboardTeams[name]['points'] = 0;
        } else {
            scoreboardTeams[name]['points'] = Math.round(teamPoints[name] / playerCount);
        }

        scoreboardTeams[name]['players'].sort(function(a, b){
            return b.points - a.points;
        });

        if (scoreboardTeams[name]['players'].length > 5) {
            scoreboardTeams[name]['players'].length = 5;
        }
    }

    io.emit('show_scoreboard', scoreboardTeams);

    setTimeout(stopGame, scoreboardTime * 1000);
}

function stopGame() {
    io.emit('stop');
    io.emit('update_round', currentRound + '/' + rounds);
    prepareGame();
    log.info('Game', 'Game stopped');
}

function endRound() {
    log.info('Game', 'Ending round');
    isRoundRunning = false;
    io.emit('update_correct', currentQuestionRow.correct_answer.toLowerCase());
    io.emit('update_count', {letter: 'a', count: count['a']});
    io.emit('update_count', {letter: 'b', count: count['b']});
    io.emit('update_count', {letter: 'c', count: count['c']});
    io.emit('update_count', {letter: 'd', count: count['d']});

    for (let socketid in players) {
        io.to(socketid).emit('update_points', players[socketid].points);
        io.to(socketid).emit('update_teampoints', teamPoints[players[socketid].team]);
    }

    if (autoplay) {
        log.info('Autoplay', 'Queueing next question in ' + autoplayTime + ' seconds');
        setTimeout(nextQuestion, autoplayTime * 1000);
    }
}

function prepareGame() {
    count['a'] = 0;
    count['b'] = 0;
    count['c'] = 0;
    count['d'] = 0;

    timeRemaining = defaultTime;
    for (let teamIndex in teams) {
        teamPoints[teams[teamIndex]] = 0;
    }
}

function prepareClient(socket) {
    players[socket.id] = new Player();
    if (isGameRunning) {
        socket.emit('start');

        socket.emit('update_round', currentRound + '/' + rounds);
        socket.emit('update_timer', timeRemaining);
        socket.emit('update_question', currentQuestionRow.question);
        socket.emit('update_answers', {
            a: currentQuestionRow.answer_a,
            b: currentQuestionRow.answer_b,
            c: currentQuestionRow.answer_c,
            d: currentQuestionRow.answer_d
        });
    } else {
        socket.emit('stop');
        socket.emit('add_teams', teams);
    }
}

function questionTimer() {
    if (isRoundRunning) {
        timeRemaining--;

        io.emit('update_timer', timeRemaining);

        if (timeRemaining <= 0) {
            endRound();
        }
    }
}

setInterval(questionTimer, 1000);
prepareGame();

http.listen(port, function(){
    log.info('Web', 'Server listening on *:' + port);
});
