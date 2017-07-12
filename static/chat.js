/**
 * Created by aaghran on 06/07/17.
 */

function Chat(settings) {
    this.users = [];
    this.sender = {};
    this.reciever = {};
    this.socket = io();
    var default_settings = {};
    this.settings = settings;
    this.msgKey = "";

    var obj = this;

    this.init = function () {
        this.bindEvents();

        if (getCookie("userId") != "") {
            $('#number').val(getCookie("userId"));
            $('#addUserCTA').click();
            setCookie("userId", getCookie("userId"), 1)
        }

        obj.socket.on('rcvMsg', function (data, opts) {
            var default_settings = {isAll: false, isPrepend: false, isNew: false};
            opts = $.extend({}, default_settings, opts || {});
            console.log("Messages received :", data.length);
            if (!data.length)
                return;
            var msgKey = JSON.parse(data[0]).msgKey || "";
            if (opts.isAll && !opts.isNew && msgKey == obj.msgKey) {
                $('#messages li:not(.append)').remove();
            }
            if ($.isEmptyObject(obj.reciever)) {
                return;
            }
            var rcvdMsg = false;
            for (var index in data) {
                var msg = JSON.parse(data[index]);
                var className = "rcvd";
                if (msg.from.number == obj.sender.number) {
                    className = "sent";
                }
                if (msg.msgKey == obj.msgKey && (opts.isAll || msg.from.number == obj.reciever.number && msg.to.number == obj.sender.number)) {
                    if (opts.isPrepend) {
                        $('#messages').prepend($('<li class="u_ellipsis msg-content msg-' + className + '">').html("<span>" + msg.msg_content + "</span>"));
                    } else {
                        var isnew = "";
                        if (msg.from.number != obj.sender.number) {
                            isnew = "new";
                            rcvdMsg = true;
                        }
                        $('#messages').append($('<li class="u_ellipsis msg-content msg-' + className + ' ' + isnew + ' append">').html("<span>" + msg.msg_content + "</span>"));
                        console.log('Emit Message received :');

                    }
                    $('#messages').scrollTop($('#messages li:last').offset().top);

                }
            }
            if (rcvdMsg) {
                obj.socket.emit('rcvdMsg', msg.msgKey, function (responseData) {
                    console.log('Message received :', responseData);
                });
                $(".friend-msgKey-" + msg.msgKey).find('.new-msg_count').hide();
            }
        });

        obj.socket.on("newNotif", function (data, opts) {
            data = JSON.parse(data);
            $.ajax({
                url: "/api/user/last-message/" + data.msgkey + "/" + data.number, success: function (result) {
                    console.log(result);
                    obj.loadMsgs(result);
                }
            });
        })
    };


    this.loadFriends = function (data) {
        obj.friendList = data;
        for (var index in obj.friendList) {
            var friend = obj.friendList[index];
            console.log("Friends load");
            console.log(friend)
            var friendTemplate = $("#friend-template").clone();
            friendTemplate.removeAttr('id');
            friendTemplate.addClass('js-friend');
            friendTemplate.addClass('friend-' + friend.number);
            friendTemplate.addClass('friend-msgKey-' + friend.msgkey);
            friendTemplate.attr("data-name", friend.name.replace(" ", '_').toLowerCase());
            friendTemplate.attr("data-userid", friend.number);
            friendTemplate.attr("data-msgkey", friend.msgkey);
            friendTemplate.find(".friend-name").text(friend.name);
            friendTemplate.show();
            $(".friend-list").append(friendTemplate);
            // load latest message
            $.ajax({
                url: "/api/user/last-message/" + friend.msgkey + "/" + friend.number, success: function (result) {
                    console.log(result);
                    obj.loadMsgs(result);
                }
            });
        }
        $('.js-friend').click(function () {
            var userId = $(this).data("userid");
            var msgKey = $(this).data("msgkey");
            $("#messages").empty();
            obj.setReceiver({userId: userId, msgKey: msgKey});
            $('.js-friend').removeClass("selected");
            $(this).addClass("selected");
            obj.msgKey = msgKey;
        });
        $(".js-friend:first").click();
    };

    this.loadMsgs = function (data) {

        for (var user_id in data) {
            if (data[user_id]["lastMsg"]) {
                var msg = JSON.parse(data[user_id]["lastMsg"]);
                if (msg.to.number == obj.sender.number || msg.from.number == obj.sender.number ) {
                    var newMsg_count = data[user_id]["newMsgCount"];
                    var msgKey = $(".friend-" + user_id).attr("data-msgkey");
                    console.log(msgKey);
                    $(".friend-" + user_id).find('.msg-content').text(msg.msg_content);
                    console.log(msg.from.number);
                    if (msg.from.number != obj.sender.number) {
                        $(".friend-" + user_id).find('.new-msg_count').text(newMsg_count);
                        if (newMsg_count > 0) {
                            $(".friend-" + user_id).find('.new-msg_count').show();
                        }
                    }
                }
            }

            console.log("Last Msg load " + user_id);
        }
    }

    this.setSender = function (userId) {
        console.log("Load user : " + userId);
        // Load users from api
        $.ajax({
            url: "/api/user/load/" + userId, success: function (result) {
                console.log(result);
                if (result.sender) {
                    $("#senderContainer").hide();
                    $(".user-registration").hide();
                    $("#chatContainer").show();
                    obj.sender = result.sender;
                    setCookie("userId", obj.sender.number, 1);
                    $(".js-sender .friend-name").text(obj.sender.name);
                    obj.loadFriends(result.friendList);
                }
                else {
                    console.log("User not found, register new");
                    $(".senderContainer").hide();
                    $(".user-registration").show();
                    $("#reg-number").val($("#number").val());
                    $("#reg-name").focus();
                }
            }
        });
        // Bind search
        $('#search').keypress(function (e) {
            if (e.which == 13) {
                $('#searchCTA').trigger("click");
            }
        });

        $('#searchCTA').click(function () {
            var friend_name = $('#search').val();
            $(".js-friend").show();
            if (!friend_name.trim()) {
                return false;
            }
            $(".js-friend").each(function (index, ele) {
                var name = $(ele).attr("data-name");
                if (name && name.indexOf(friend_name.replace(" ", "_").toLowerCase()) < 0) {
                    $(ele).hide();
                }
            })

        });
    };

    this.registerUser = function (params) {
        return $.ajax({
            url: "/api/user/createOrUpdate/",
            data: params,
            success: function (result) {
                console.log(result);
                obj.setSender(result.number);
            },
            method: "post"
        });
    }

    this.setReceiver = function (params) {
        console.log("Receiver set : " + params.toString());
        this.reciever = this.friendList[params.userId];
        $(".receiverHeader").html(this.reciever.name);
        this.loadChat(params.msgKey);
    };

    this.loadChat = function (msgKey) {
        obj.socket.emit('newMsgs', msgKey, function (responseData) {
            $("#messages").empty();
        });
        obj.socket.emit('loadMsgs', msgKey, function (responseData) {
            console.log("messages loaded ", responseData);
        });
    };

    this.bindEvents = function () {
        // Compose Box bindings
        $('#msg').keypress(function (e) {
            if (e.which == 13) {
                $('#sendCTA').trigger("click");
            }
        });
        $('#sendCTA').click(function () {
            var msg_content = $('#msg').val();
            if (!msg_content.trim()) {
                return false;
            }
            var data = {};
            data.from = obj.sender;
            data.to = obj.reciever;
            data.msg_content = msg_content;
            data.msgKey = obj.msgKey;
            $('#messages').append($('<li class="u_ellipsis msg-content msg-' + "sent" + '">').html("<span>" + data.msg_content + "</span>"));
            $('#messages').scrollTop($('#messages li:last').offset().top);
            $(".friend-" + data.to.number).find('.msg-content').text(data.msg_content);
            obj.sendMsg(data);
        });

        // User enter binding
        $('#number').keypress(function (e) {
            if (e.which == 13) {
                $('#addUserCTA').trigger("click");
            }
        });

        $('#addUserCTA').click(function () {
            var number = $('#number').val();
            if (!number.trim()) {
                $(".friend").show();
            }
            obj.setSender(number);
        });

        // Registration bindings
        $('#reg-number').keypress(function (e) {
            if (e.which == 13) {
                $('#reg-name').focus();
            }
        });
        $('#reg-name').keypress(function (e) {
            if (e.which == 13) {
                $('#addUserCTA').trigger("click");
            }
        });

        $('#regUserCTA').click(function () {
            var number = $('#reg-number').val();
            var name = $('#reg-name').val();
            if (!number.trim()) {
                alert("Enter a number");
                return false;
            }
            if (!name.trim()) {
                alert("Enter a name");
                return false;
            }
            obj.registerUser({number: number, name: name});
        });

        $('#logout').click(function () {
            setCookie("userId", "", 1);
            window.location.reload(true);
        });

    };

    this.sendMsg = function (data) {
        obj.socket.emit('sendMsg', data, function (responseData) {
            console.log('Callback called with data:', responseData);
        });
        $('#msg').val('');
        console.log("message sent : " + data.msg_content);
        console.log(data);
        return false;
    }
    this.init();
};

function Person(params) {
    this.name = params.name;
    this.number = params.number;
}

Person.prototype.valueOf = function () {
    return this.number;
};


$(function () {
    var chatObj = new Chat();
});


// Utility Functions
var setCookie = function (cname, cvalue, exdays) {
    var d = new Date();
    exdays = parseInt(exdays);
    d.setTime(d.getTime() + (exdays * 24 * 60 * 60 * 1000));
    var expires = "expires=" + d.toUTCString();
    document.cookie = cname + "=" + cvalue + "; " + expires + ";path=/";
}

var getCookie = function (cname) {
    var name = cname + "=";
    var ca = document.cookie.split(';');
    for (var i = 0; i < ca.length; i++) {
        var c = ca[i];
        while (c.charAt(0) == ' ') c = c.substring(1);
        if (c.indexOf(name) == 0) return c.substring(name.length, c.length);
    }
    return "";
}