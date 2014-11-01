
$(document).ready(function() {
    var socket = io.connect(window.location.hostname + "/generic");

    socket.on('new payer', function(data)
    {
        console.log(data);
    });
});