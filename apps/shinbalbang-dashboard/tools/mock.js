// 브라우저 모의 테스트용 가짜 네이티브 브리지 (테스트 데이터, 실제 값 아님)
(function(){
  function pad(n){return (n<10?'0':'')+n;}
  var now=new Date(); now.setMinutes(0,0,0);
  function iso(d){return d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate())+'T'+pad(d.getHours())+':'+pad(d.getMinutes());}
  function day(d){return iso(d).substr(0,10);}
  var start=new Date(now); start.setDate(start.getDate()-1); start.setHours(0);
  var ht=[],tt=[],wc=[],pp=[];
  for(var i=0;i<9*24;i++){var d=new Date(start.getTime()+i*3600e3);ht.push(iso(d));tt.push(8+6*Math.sin((d.getHours()-9)/24*2*Math.PI)+(i%7)/3);wc.push([0,1,2,3,61,3,2,1][i%8]);pp.push((i*13)%90);}
  var dt=[],mx=[],mn=[],dw=[],dp=[],sr=[],ss=[];
  for(var k=0;k<9;k++){var d=new Date(start.getTime()+k*864e5);dt.push(day(d));mx.push(14+(k%3));mn.push(3+(k%4));dw.push([0,2,3,61,1,0,71,2,3][k]);dp.push((k*17)%100);sr.push(day(d)+'T07:05');ss.push(day(d)+'T17:20');}
  var W={current:{time:iso(now),temperature_2m:11.3,apparent_temperature:9.8,relative_humidity_2m:54,weather_code:2,wind_speed_10m:2.4},
    hourly:{time:ht,temperature_2m:tt,weather_code:wc,precipitation_probability:pp},
    daily:{time:dt,weather_code:dw,temperature_2m_max:mx,temperature_2m_min:mn,precipitation_probability_max:dp,sunrise:sr,sunset:ss}};
  var A={current:{pm10:32,pm2_5:18,uv_index:2.1}};
  var rss='<?xml version="1.0"?><rss><channel>';
  for(var n=1;n<=20;n++) rss+='<item><title>테스트 기사 제목 '+n+' — 가로 화면 한 줄 말줄임 확인용 긴 문장입니다</title><link>http://x/'+n+'</link></item>';
  rss+='</channel></rss>';
  function ev(off,h,t){var d=new Date();d.setDate(d.getDate()+off);var s=d.getFullYear()+pad(d.getMonth()+1)+pad(d.getDate());return 'BEGIN:VEVENT\r\nUID:'+t+'\r\nDTSTART:'+s+'T'+pad(h)+'0000\r\nDTEND:'+s+'T'+pad(h+1)+'0000\r\nSUMMARY:'+t+'\r\nEND:VEVENT\r\n';}
  var ics='BEGIN:VCALENDAR\r\n'+ev(0,10,'테스트 일정 A')+ev(0,15,'테스트 일정 B')+ev(1,9,'테스트 일정 C')+ev(2,19,'테스트 일정 D')+'END:VCALENDAR\r\n';
  try{localStorage.setItem('dash.calUrls',JSON.stringify(['https://mock.test/cal.ics']));}catch(e){}
  window.__mockBody=function(url){
    if(url.indexOf('air-quality')>=0)return JSON.stringify(A);
    if(url.indexOf('open-meteo')>=0)return JSON.stringify(W);
    return null;};
  window.AndroidNet={fetch:function(id,url){var body,ok=true;
    if(url.indexOf('air-quality')>=0)body=JSON.stringify(A);
    else if(url.indexOf('open-meteo')>=0)body=JSON.stringify(W);
    else if(url.indexOf('yna')>=0)body=rss;
    else if(url.indexOf('holiday')>=0)body='BEGIN:VCALENDAR\r\nEND:VCALENDAR\r\n';
    else if(url.indexOf('.ics')>=0)body=ics; else {ok=false;body='mock 없음';}
    setTimeout(function(){window.__nativeCb(id,ok,body);},30);}};
})();
