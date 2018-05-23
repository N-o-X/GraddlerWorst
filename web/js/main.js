var socket = io();
socket.on('update_round', function (msg){
    $('#round').html(msg);
});
socket.on('update_question', function(msg){
    $('#question').html(msg);
});
socket.on('update_answer_a', function(msg){
    $('#answerA').html(msg)
});
socket.on('update_answer_b', function(msg){
    $('#answerB').html(msg)
});
socket.on('update_answer_c', function(msg){
    $('#answerC').html(msg)
});
socket.on('update_answer_d', function(msg){
    $('#answerD').html(msg)
});
socket.on('update_timer', function(msg){
    $('#timer').html(msg);
});
socket.on('update_count', function(msg){
    var parts = msg.split('_');
    $('#' + parts[0]).html(parts[1]);
});

socket.on('start', function(msg){
    document.getElementById("before_game").style.display = "none";
    document.getElementById("game").style.display = "block";
});
socket.on('stop', function(msg){
    document.getElementById("before_game").style.display = "block";
    document.getElementById("game").style.display = "none";
});