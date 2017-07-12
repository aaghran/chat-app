"use strict";
let app = require("express")();
const server = require("http").Server(app);
let port = process.env.PORT || 3020;
let bodyParser = require('body-parser');
app.use(bodyParser({limit: '50mb'}));                      // pull information from html in POST
app.use(bodyParser.json({limit: '5mb'})); // support json encoded bodies
app.use(bodyParser.urlencoded({extended: true, limit: '5mb'})); // support encoded bodies

var redis = require("redis");
// create a new redis client and connect to our local redis instance
var client = redis.createClient({host: '127.0.0.1', port: 6379});
var multi = client.multi();


var users = [];
client.hgetall('userData', function (err, result) {
    if (err) {
        console.log(err);
    }
    console.log(result);

    users = result;

});
const io = require('socket.io')(server);


app.get("/static/:fileName", function (req, res) {
    res.sendFile(__dirname + `/static/${req.params.fileName}`);
});


app.get("/", function (req, res) {
    res.sendFile(__dirname + "/index.html");
});

/**
 * Create or Update User Information
 * @params
 * Name - String
 * Number - String
 * Photo - String
 **/
app.post("/api/user/createOrUpdate", function (req, res) {
    var userData = req.body;
    console.log("Create or Update user :", userData.number);
    createOrUpdateUser(userData);
    updateFriend();
    res.send(userData);
});

/**
 * Create or Update User Information
 * @params
 * Name - String
 * Number - String
 * Photo - String
 **/
app.get("/api/user/friend/all", function (req, res) {
    res.send("Ok");
    updateFriend();
});

app.get("/api/user/load/all", function (req, res) {
    client.hgetall('userData', function (err, result) {
        if (err) {
            console.log(err);
            res.send({});
        }
        console.log(result);

        users = result;

        res.send(result);
    });
});


/**
 * Create or Update User Information
 * @params
 * Name - String
 * Number - String
 * Photo - String
 **/
app.get("/api/user/load/:userId", function (req, res) {
    var userId = req.params.userId;
    var redisKey = "user_" + userId;
    // multi.hget('userData', redisKey);
    // multi.hgetall('userFriendData');
    // multi.hget('userData', redisKey);
    // multi.exec(function(err, replies) {
    //
    // });
    // @TODO : multi here also
    client.hget('userData', redisKey, function (err, result) {
        if (err) {
            console.log(err);
        }

        var data = {};
        if (result) {
            data.sender = JSON.parse(result);
            client.hgetall('userFriendData', function (err, result) {
                var tmp = {};
                for (var key in result) {
                    // if key begins with userId
                    if (key.startsWith(userId)) {
                        var temp = key.split("_");
                        var sender = temp[0];
                        var friend = temp[1];
                        if (sender != friend && userId == sender) {
                            var msgKey = result[key];
                            tmp[friend] = JSON.parse(users["user_" + friend]);
                            tmp[friend]["msgkey"] = msgKey;
                            console.log("load user friend", friend, sender, "and message key", msgKey);
                            data.friendList = tmp;
                        }
                    }
                }
                console.log(tmp);
                res.send(data);
            })
        } else {
            res.send({});
        }
    });
});

app.get("/api/user/last-message/:msgKey/:userid", function (req, res) {
    var msgKey = req.params.msgKey;
    var userid = req.params.userid;

    lastMsg(msgKey, function (data) {
        var tmp = {};
        tmp[userid] = {};
        console.log("------- Load last message --------");
        if (data.newMsg.length)
            tmp[userid]["lastMsg"] = data.newMsg[data.newMsg.length - 1];
        else
            tmp[userid]["lastMsg"] = data.msg[0];
        tmp[userid]["newMsgCount"] = data.newMsg.length;

        res.send(tmp);
    });
});


// Socket io bindings
io.on("connection", function (socket) {
    socket.on("addUser", function (data) {
        // Add user to online status queue.
    });
    socket.on("sendMsg", function (data, cb) {
        console.log("message in server from : " + data.from.number);
        console.log(data);
        var message = new Message(data);
        message.save_new();
        io.emit("rcvMsg", [JSON.stringify(data)], {isNew: true});
        io.emit("newNotif", [JSON.stringify({msgkey: data.msgKey, number: data.from.number})], {isNew: true});
        cb("Received");
    });
    socket.on("msgRead", function (data) {
        console.log("message read : " + data.to.number);
    });
    socket.on("newMsgs", function (data) {
        // Load from new msgs list
        loadNewMsgs(data, function (result) {
            console.log("--- Load new messages ---");
            console.log(result);
            io.emit("rcvMsg", result, {isAll: true, isNew: true});
        });
    });
    socket.on("rcvdMsg", function (data) {
        console.log("Message recieved. Shift from new to archive");
        console.log(data);
        if (data) {
            saveToArchive(data);
        }
    });

    socket.on("loadMsgs", function (data) {
        loadMsgs(data, function (result) {
            io.emit("rcvMsg", result, {isAll: true, isPrepend: true});
        });
    });
});

server.listen(port, function () {
    console.log("listening on *:" + port);
});

var storeMsg = function (data) {

};


var createOrUpdateUser = function (data) {
    var userData = data;
    console.log(data);
    if (!userData.number) {
        console.log("Number invalid, unable to find user");
        return false;
    }
    var userKey = "user_" + userData.number;
    // var notFound = false;
    client.hmset("userData", userKey, JSON.stringify(userData));
    client.hgetall('userData', function (err, result) {
        if (err) {
            console.log(err);
        }
        console.log(result);
        users = result;
    });
};


var User = function (params) {
    this.name = params.name || '';
    this.number = params.number;
    this.photo = params.url || '';
    this.last_online = new Date();
    this.last_message = {};
};

var updateFriend = function () {
    client.hgetall('userData', function (err, result) {
        if (err) {
            console.log(err);
            res.send({});
        }
        console.log(result);

        for (var temp_user1 in result) {
            console.log(temp_user1.number);
            temp_user1 = JSON.parse(result[temp_user1]);
            for (var temp_user2 in result) {
                (function (temp_user1, temp_user2) {
                    console.log(temp_user2.number);
                    temp_user2 = JSON.parse(result[temp_user2]);
                    if (temp_user1.number != temp_user2.number) {
                        var redisKey12 = temp_user1.number + "_" + temp_user2.number;
                        var redisKey21 = temp_user2.number + "_" + temp_user1.number;
                        var msgKey = redisKey12 + redisKey21;
                        // @@TODO : change to multi
                        client.hget('userFriendData', redisKey12, function (err, result) {
                            if (err) {
                                console.log(err);
                                res.send({});
                            }
                            if (!result) {
                                client.hmset("userFriendData", redisKey12, msgKey);
                                client.hmset("userFriendData", redisKey21, msgKey);
                            }
                        });
                    }
                })(temp_user1, temp_user2);
            }
        }
    });
};

var loadNewMsgs = function (msgKey, cb) {
    console.log("Load messages from new :", msgKey);
    var key_new = "msgDataNew_" + msgKey;
    var msgs = [];
    client.lrange(key_new, 0, -1, function (error, result) {
        // If result exists, update or else add to redis
        if (result) {
            msgs = result;
            console.log("New messages :" + msgs.length);
        }
        cb(msgs);
    });
};

var lastMsg = function (msgKey, cb) {
    console.log("In Load messages from new :", msgKey);
    var key_new = "msgDataNew_" + msgKey;
    var key = "msgData_" + msgKey;
    var data = {
        newMsg: [],
        msg: []
    };
    client.lrange(key_new, 0, -1, function (error, result) {
        // If result exists, update or else add to redis
        data.newMsg = result;
        console.log("Last message in new?");
        console.log(result);
        client.lrange(key, 0, 0, function (error, result) {
            console.log("Last message in archive? :");
            console.log(result);
            data.msg = result;
            cb(data);
        });

    });

}

var loadMsgs = function (msgKey, cb) {
    console.log("Load messages from archive :", msgKey);
    var key = "msgData_" + msgKey;
    var obj = this;
    var msgs = [];
    var start = 0;
    var end = -1;
    client.lrange(key, start, end, function (error, result) {
        console.log(msgs);
        console.log(result);
        msgs = result;
        cb(msgs);
    });
};


// Message!
var Message = function (params) {
    this.from = params.from;
    this.to = params.to;
    this.msg_content = params.msg_content;
    this.deliver_time = 0;
    this.generation_time = new Date();
    this.msgKey = params.msgKey;
    var obj = this;

    this.storeData = function () {
        return {
            from: this.from,
            to: this.to,
            msg_content: this.msg_content,
            deliver_time: this.deliver_time,
            generation_time: this.generation_time,
            msgKey: this.msgKey
        };
    };

    this.content = function () {
        return this.msg_content;
    }
};


var saveToArchive = function (msgKey) {
    var key = "msgData_" + msgKey;
    var key_new = "msgDataNew_" + msgKey;
    var msgs = [];
    console.log(key);
    console.log(key_new);
    console.log("----------- In save --------------");
    client.lrange(key_new, 0, -1, function (err, result) {
        var inputArray = [key];
        console.log(result);
        var tmp = inputArray.concat(result);
        console.log(tmp);
        client.lpush(tmp, function (err, result) {
            console.log("message inserted into archive ", msgKey);
        });
    });
    client.del(key_new, function (err, result) {
        console.log("new msg list empty :");
    });
};

Message.prototype.save_new = function () {
    var obj = this;
    var key = "msgDataNew_" + obj.msgKey;
    console.log(key);
    var data = JSON.stringify(obj.storeData());
    console.log(data);
    client.rpush([key, data], function (err, result) {
        console.log("message inserted :" + obj.content());
    });
};

