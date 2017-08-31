var cookie_vip_key = "irV8jfnifwlj9o0Y";
var cookie_vip_val = "iGL4OvQbzTfToq5m";
var key = 'doubi';
var map = {
    'juejin': '掘金', 'oschina': '开源中国', 'sjdbc': 'Sharding-JDBC',
    'jianshu': '简书', 'csdn': 'CSDN', 'iteye': 'iteye', 'cnblogs': '博客园'
};

function isVIP() {
//        debugger;
    var vip = false;
    if (location.hostname.indexOf('vip') >= 0) {
        vip = true;
    }
    if (!vip && location.search.indexOf('vip') >= 0) {
        vip = true;
    }
    if (vip) {
        $.cookie(cookie_vip_key, cookie_vip_val, { expires: 365, path: '/' });
    }
    var cookieVIP = $.cookie(cookie_vip_key);
    if (cookieVIP === cookie_vip_val) {
        return true;
    }
    return false;
}

function getFrom() {
    var from = 'default';

    for (var item in map) {
        if (location.search.indexOf(item) >= 0) {
            from = item;
            break;
        }
    }
    if (from === 'default') {
        from = $.cookie('from') || 'default';
    }
    $.cookie('from', from, { expires: 365, path: '/' });
    return from;
}

function isMobile() {
    if (/(iPhone|iPad|iPod|iOS)/i.test(navigator.userAgent)) {
        return true;
    } else if (/(Android)/i.test(navigator.userAgent)) {
        return true;
    } else {
        return false;
    }
}

function isDomainVIP() {
    return location.hostname.indexOf('vip') >= 0;
}

function getCount() {
    var count = $.cookie(key);
    if (!count) {
        $.cookie(key, 0, { expires: 1, path: '/' });
        count = 0;
    } else {
        count = parseInt(count);
    }
    $.cookie(key, count, { expires: 1, path: '/' });
    return count;
}

function handleVIPURL() {
    if (isVIP()) {
        return;
    }
    // debugger;
    // $('a').each(function (el) {
    //     debugger;
    // });
    var els = $('.post a');
    for (var i in els) {
        var el = els[i];

        if (!el || !el.getAttribute) {
            continue
        }

        var timeStr = el.getAttribute('data-date');
        if (timeStr) {
            var date = new Date(timeStr);
            if (date > new Date()) {
                // alert('不可见');
                // debugger;

                el.setAttribute('href', '#');
                // el.setAttribute('title', '#');

                $(el).click(function () {

                    var from = getFrom();

                    var prefix = '';
                    var prefix2 = '';
                    if (from && map[from]) {
                        prefix = '<span style="color: red">欢迎来自【' + map[from] + '】的同学</span>';
                        prefix2 = '【' +  map[from] + '】';
                    }
                    var hour = new Date().getHours();
                    var numbers = 103 + hour * 5;

                    var doubi = jqueryAlert({
                        'title': '👼抱歉，该文章仅公众号可见，【扫一扫】关注公众号👼',
                        'width'   : '500',
                        'height'  : '560',
                        'modal': true,
                        'content' : prefix + '<span style="color: red">，今日' + prefix2 + '已关注人数：' + numbers + '</span>'
                        + '<p style="color: red">关注后，欢迎加入【源码圈】微信群交流</p>'
                        + '<p style="color: red">一起看源码，读源码，提升技术！</p>'
                        + '<img width="400" src="http://www.yunai.me/images/common/wechat_mp_simple.png" />'
                        ,
                        'buttons' :{
                            '已关注，关闭窗口（公众号发送：【嘿嘿】查看文章）' : function() {
                                doubi.close();
                            }
                        }
                    });

                    // alert('666');

                });
            }
        }

        // 移除友链
        if (el.getAttribute('title') === '友情链接') {
            el.remove();
        }
    }
}

function handleAlert() {
    var count = getCount();
    var from = getFrom();

    var prefix = '';
    var prefix2 = '';
    if (from && map[from]) {
        prefix = '<span style="color: red">欢迎来自【' + map[from] + '】的同学</span>';
        prefix2 = '【' +  map[from] + '】';
    }
//        count = 1;
    var alertMax = 1024;
    if (count < alertMax) {
        var hour = new Date().getHours();
        var numbers = 103 + hour * 5;
        function explode() {

            var doubi = jqueryAlert({
                'title': '👼每周六更新一篇源码解析，【扫一扫】关注公众号👼',
                'width'   : '500',
                'height'  : '580',
                'modal': true,
                'content' : prefix + '<span style="color: red">，今日' + prefix2 + '已关注人数：' + numbers + '</span>'
                + '<p style="color: red">关注后，欢迎加入【源码圈】微信群交流</p>'
                + '<p style="color: red">一起看源码，读源码，提升技术！</p>'
                + '<img width="400" src="http://www.yunai.me/images/common/wechat_mp_simple.png" />'
                + '<p style="color: blue">抱歉，该弹窗每天弹出 ' + alertMax + ' 次。</p>'
                ,
                'buttons' :{
                    '已关注，关闭窗口（公众号发送：【口令】屏蔽弹窗）' : function() {
                        doubi.close();

                        // handleAlert();
                    }
                }
            });

            $.cookie(key, count + 1, { expires: 1 , path: '/'});
        }
        setTimeout(explode, ( count + 1 ) * 15000);
        // setTimeout(explode, ( count + 1 ) * 1000);
    };
}

$(document).ready(function(){
    // debugger;
    // debugger;

    if (isDomainVIP()) {
        console.log('vip域名，跳转中');
        // debugger;
        var search = location.search;
        if (search && search.length > 0) {
            search += '&vip';
        } else {
            search += '?vip';
        }
        window.location.href = 'http://www.yunai.me' + search;
        return;
    }

    var from = getFrom();

    if (isMobile()) {
        console.log('手机端，不用弹窗');
        // alert('手机');

        $('#authorInfo').remove();

        $('time').remove();

        return;
    }
//        alert('啦啦啦');
    if (isVIP()) {
        console.log('你是vip，不用弹窗');
//            alert('啦啦啦');
        return;
    }

    // handleVIPURL();

    handleAlert();
});