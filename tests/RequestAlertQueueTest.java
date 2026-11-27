package uy.viatraslados.conductor;
import java.util.*;
public final class RequestAlertQueueTest {
 static void check(boolean v){if(!v)throw new AssertionError();}
 public static void main(String[] args){
  var rows=List.of(new RequestAlertQueue.Entry("A","100"),new RequestAlertQueue.Entry("B","99"),new RequestAlertQueue.Entry("C","98"),new RequestAlertQueue.Entry("A","100"));
  Set<String> saved=new HashSet<>();
  for(String expected:List.of("A","B","C")){
   var s=RequestAlertQueue.next(rows,id->saved.contains(RequestAlertQueue.key("driver1",id)));
   check(s.id.equals(expected)&&s.count==3-saved.size());
   saved.add(RequestAlertQueue.key("driver1",s.id));
  }
  check(RequestAlertQueue.next(rows,id->saved.contains(RequestAlertQueue.key("driver1",id)))==null);
  check(RequestAlertQueue.next(rows,id->saved.contains(RequestAlertQueue.key("driver2",id))).count==3);
  var refresh=new ArrayList<>(rows);refresh.add(new RequestAlertQueue.Entry("D","101"));
  var s=RequestAlertQueue.next(refresh,id->saved.contains(RequestAlertQueue.key("driver1",id)));
  check(s.id.equals("D")&&s.count==1);
  check(RequestAlertQueue.key("","A").isEmpty());
  Set<String> announced=new HashSet<>();
  var b=RequestAlertQueue.batch(rows,id->false,announced::contains);
  check(b.pending==3&&b.unannounced.size()==3);
  announced.addAll(b.unannounced);
  b=RequestAlertQueue.batch(rows,id->false,announced::contains);
  check(b.pending==3&&b.unannounced.isEmpty()); // Ahora no never marks viewed
  b=RequestAlertQueue.batch(refresh,id->id.equals("A"),announced::contains);
  check(b.pending==3&&b.unannounced.equals(List.of("D")));
  b=RequestAlertQueue.batch(rows,id->true,announced::contains);
  check(b.pending==0&&b.unannounced.isEmpty());
  check(RequestAlertQueue.batch(rows,id->false,id->false).pending==3); // another account
  System.out.println("VIA_EXTERNAL_BATCH_PASS pending count, dedupe, defer, new arrivals, seen, account isolation");
  System.out.println("VIA_REQUEST_QUEUE_PASS sequence 3/2/1/0, duplicate feed, refresh, separate account");
 }
}
