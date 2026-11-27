package uy.viatraslados.conductor;

import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.function.Predicate;

/** Selection only; permission checks and durable acknowledgement belong to Activity. */
final class RequestAlertQueue {
    static final class Entry {
        final String id, created;
        Entry(String id,String created){this.id=id;this.created=created==null?"":created;}
    }
    static final class Selection {
        final String id;final int count;
        Selection(String id,int count){this.id=id;this.count=count;}
    }
    static final class Batch {
        final int pending;final List<String> unannounced;
        Batch(int pending,List<String> unannounced){this.pending=pending;this.unannounced=unannounced;}
    }
    static Batch batch(List<Entry> entries,Predicate<String> seen,Predicate<String> announced){
        Set<String> distinct=new HashSet<>();List<String> fresh=new java.util.ArrayList<>();
        int count=0;
        for(Entry e:entries){
            if(e==null||e.id==null||e.id.isEmpty()||!distinct.add(e.id)||seen.test(e.id))continue;
            count++;if(!announced.test(e.id))fresh.add(e.id);
        }
        return new Batch(count,fresh);
    }
    static String key(String account,String id){
        return account==null||account.isEmpty()||id==null||id.isEmpty()?"":"seen_"+account+"_"+id;
    }
    static int compare(String a,String b){
        try{return Long.compare(Long.parseLong(a),Long.parseLong(b));}
        catch(NumberFormatException ignored){return a.compareTo(b);}
    }
    static Selection next(List<Entry> entries,Predicate<String> seen){
        Set<String> distinct=new HashSet<>();
        Entry newest=null;int count=0;
        for(Entry e:entries){
            if(e==null||e.id==null||e.id.isEmpty()||!distinct.add(e.id)||seen.test(e.id))continue;
            count++;
            if(newest==null||compare(e.created,newest.created)>0)newest=e;
        }
        return newest==null?null:new Selection(newest.id,count);
    }
}
