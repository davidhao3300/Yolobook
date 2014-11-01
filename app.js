/**
 * Module dependencies.
 */
var express = require('express')
  , http = require('http')
  , _ = require('underscore')
  , path = require('path')
  , fs = require('fs')
  , request = require('request');

//Create an express app
var app = express();

//Create the HTTP server with the express app as an argument
var server = http.createServer(app);
var io = require('socket.io').listen(server);

// Mongoose stuff
var mongoose = require('mongoose');
var uristring =
process.env.MONGOLAB_URI ||
process.env.MONGOHQ_URL ||
'mongodb://localhost/test';

mongoose.connect(uristring);
var db = mongoose.connection;

var User = mongoose.model('User', {
  yo: String,
  venmo: String,
  venmo_id: String
});

var YoTask = mongoose.model('YoTask', {
  yo: String,
  payment_id: String,
  shouldYo: Boolean,
  timeCreated: Number,
  venmo: String
});

setInterval(function() {
  YoTask.find({}, function(err, docs) {
    for (var i = 0; i < docs.length; i++)
    {
      console.log(docs[i]);
      var yotask = docs[i];

      // Just yo for now.

      //if (!yotask.shouldYo)
      //{
        // Normally check whether grace period is over.
      //  yotask.shouldYo = true;
      //  yotask.save();
      //}
      //else
      //{
        request.get('https://api.venmo.com/v1/payments/' + yotask.payment_id + '?access_token=' + yotask.venmo, 
          function(err, httpResponse, body) {
            var data = JSON.parse(body);
            console.log(JSON.parse(data.data.status == 'settled'));
            if (data.data.status == 'settled')
            {
              yotask.remove();
            }
            else
            {
              // Yopaycollector.
              request.post({
                url: 'http://api.justyo.co/yo',
                form: {
                  api_token: '',
                  username: yotask.yo
                }}, function(err, httpResponse, body) {
                 // console.log(body);
                }
              );
            }
        });
      //}
    }
  });
}, 5000);

//Generic Express setup
app.set('port', process.env.PORT || 3000);
app.set('views', __dirname + '/views');
app.set('view engine', 'jade');
app.use(express.logger('dev'));
app.use(express.bodyParser());
app.use(express.methodOverride());
app.use(app.router);
app.use(require('stylus').middleware(__dirname + '/public'));
app.use(express.static(path.join(__dirname, 'public')));

//We're using bower components so add it to the path to make things easier
app.use('/components', express.static(path.join(__dirname, 'components')));

// development only
if ('development' == app.get('env')) {
  app.use(express.errorHandler());
}

app.get('/', function(req, res) {
  res.end(JSON.stringify({}));
});

app.get('/test', function(req, res) {
  res.render("index", {});
});

app.get('/yo/:mealname', function(req,res) {
  /*User.find({}, function(err, docs) {
    console.log(docs);
  });*/
  var api_token;
  if (req.params.mealname == 'demomeal')
  {
    api_token = '';
  }
  else
  {
    api_token = '';
  }
  User.find({yo: req.query.username}, function(err, docs) {
    //console.log(docs);
    if (docs.length == 0)
    {
      var venmo_uri = 'https://api.venmo.com/v1/oauth/authorize?client_id=2061&scope=make_payments%20access_profile&response_type=code&state=' + req.query.username
      request.post({
        url: 'http://api.justyo.co/yo',
        form: {
          api_token: api_token,
          username: req.query.username,
          link: venmo_uri
        }}, function(err, httpResponse, body) {
         // console.log(body);
        }
      );
    }
    else
    {
      console.log(req.params.mealname);
      var mealName = req.params.mealname;
      //var name = "/" + mealName.substring(0, mealName.lastIndexOf("meal"));
      var name = '/generic';
      if (req.params.mealname == 'demomeal')
      {
        io.sockets.emit('new demo payer', req.query.username);
      }
      else
      {
        io.sockets.emit('new payer', req.query.username);
      }
    }
  });
  res.end(JSON.stringify({}));
});

app.get('/pleasestop', function(req, res) {
  User.find({yo: req.query.username}, function(err,docs) {
    var user = docs[0];
    YoTask.find({yo: user.yo}, function(err, docs)
    {
      for (var i = 0; i < docs.length; i++)
      {
        var yotask = docs[i];
        yotask.remove();
      }
    });
  })
  res.end(JSON.stringify({}));
});

app.get('/users/:username', function(req, res) {
  User.find({yo: req.params.username}, function(err, docs)
  {
    if (docs.length == 0)
    {
      var venmo_uri = 'https://api.venmo.com/v1/oauth/authorize?client_id=2061&scope=make_payments%20access_profile&response_type=code&state=' + req.params.username
      request.post({
        url: 'http://api.justyo.co/yo',
        form: {
          api_token: '',
          username: req.params.username,
          link: venmo_uri
        }}, function(err, httpResponse, body) {
         // console.log(body);
        }
      );
      res.end(JSON.stringify({ url: 'https://api.venmo.com/v1/oauth/authorize?client_id=2061&scope=make_payments&response_type=code&state=' + req.params.username}));
    }
    else
    {
      res.end(JSON.stringify({}));
    }
  });
});

app.post('/finish_demo/:username', function(req, res) {
  var amount = req.body.amount;
  var users = req.body.users;
  User.find({yo: req.params.username}, function(err, docs)
  {
    var receiver = docs[0];
    for (var i = 0; i < users.length; i++)
    {
      User.find({yo: users[i]}, function(err, docs)
      {
        var sender = docs[0];
        request.post({
          url: 'https://api.venmo.com/v1/payments',
          form: {
            access_token: receiver.venmo,
            user_id: sender.venmo_id,
            note: "Yopay: Pay up! Current time is: " + new Date(),
            amount: -1*amount
          }
        }, function(err, httpResponse, body) {});
      });
    }
  });

  res.end(JSON.stringify({}));
});

app.post('/finish/:username', function(req, res) {
  var amount = req.body.amount;
  var users = req.body.users;
  var failed_users = [];
  // Use Venmo here
  User.find({yo: req.params.username}, function(err, docs)
  {
    var receiver = docs[0];
    var counter = users.length;
    for (var i = 0; i < users.length; i++)
    {
      User.find({yo: users[i]}, function(err, docs)
      {
        var sender = docs[0];
        request.post({
          url: 'https://api.venmo.com/v1/payments',
          form: {
            access_token: sender.venmo,
            user_id: receiver.venmo_id,
            note: "Yopay! Current time is: " + new Date(),
            amount: amount
          }}, function(err, httpResponse, body)
          {
            console.log(body);
            if(JSON.parse(body).error)
            {
              failed_users.push(sender.yo);
              console.log("This loser didn't pay");
              request.post({
                url: 'https://api.venmo.com/v1/payments',
                form: {
                  access_token: receiver.venmo,
                  user_id: sender.venmo_id,
                  note: "Yopay: Pay up! Current time is: " + new Date(),
                  amount: -1*amount
                }
              }, function(err, httpResponse, body) {
                var data = JSON.parse(body);
                var paymentID = data.data.payment.id;

                YoTask.create({
                  yo: sender.yo,
                  shouldYo: false,
                  payment_id: paymentID,
                  timeCreated: new Date().getTime(),
                  venmo: sender.venmo
                },
                  function(err, doc) {
                    console.log(doc);
                  })
              });
            }

            counter--;
            if (counter == 0)
            {
              res.end(JSON.stringify({ failed_users: failed_users}));
            }
          });
      });
    }
  });
});

app.get('/venmo', function(req, res) {
  var venmo_uri = 'https://api.venmo.com/v1/oauth/access_token'
  request.post({url: venmo_uri, json: true, form: {
    client_id: '2061',
    client_secret: '',
    code: req.query.code
  }}, function(err, httpResponse, body) {
    User.find({yo: req.params.state}, function(err, docs) {
      if (docs.length == 0)
      {
        User.create({yo: req.query.state, venmo: body.access_token, venmo_id: body.user.id}, function(err, doc) {
          //console.log("New user:");
         // console.log(doc);
        });
      }
      else
      {
        var doc = docs[0];
        doc.venmo = body.access_token;
        doc.venmo_id = body.user.id;
        doc.save();
      }
    })
    User.update({yo: req.params.state}, {$set: { venmo: body.access_token, venmo_id: body.user.id}}, function(err) {
    });
  });
  res.end("Thanks! Yo us one more time to get in on the meal.")
});

//Set the sockets.io configuration.
//THIS IS NECESSARY ONLY FOR HEROKU!
io.configure(function() {
  io.set('transports', ['xhr-polling']);
  io.set('polling duration', 30);
});

//Create the server
server.listen(app.get('port'), function(){
  console.log('Express server listening on port ' + app.get('port'));
});
