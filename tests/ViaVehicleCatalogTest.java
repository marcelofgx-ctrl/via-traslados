package uy.viatraslados.conductor;

import java.util.Arrays;
import java.util.Calendar;
import java.util.HashSet;
import java.util.Locale;
import java.util.Set;

/** Ensayo sin Android ni red: coherencia de sugerencias para registro V33. */
public final class ViaVehicleCatalogTest {
    private static void check(boolean ok,String reason){
        if(!ok)throw new AssertionError(reason);
    }

    private static boolean contains(String[] list,String value){
        return Arrays.asList(list).contains(value);
    }

    private static void checkDistinct(String[] values,String category){
        Set<String> normalized=new HashSet<>();
        for(String item:values){
            check(item!=null&&!item.trim().isEmpty(),category+" contiene vacío");
            check(normalized.add(item.toLowerCase(Locale.ROOT)),
                category+" contiene duplicado: "+item);
        }
    }

    public static void main(String[] args){
        String[] brands=ViaVehicleCatalog.brands();
        check(ViaVehicleCatalog.modelCount()>=300,"Catálogo incompleto");
        check(brands.length>=50,"Faltan marcas sugeridas");
        checkDistinct(brands,"marcas");
        check(brands[brands.length-1].equals(ViaVehicleCatalog.OTHER),
            "Falta entrada para otras marcas");
        for(String brand:brands){
            if(brand.equals(ViaVehicleCatalog.OTHER))continue;
            String[] models=ViaVehicleCatalog.modelsFor(brand);
            check(models.length>=2,"No hay modelos para "+brand);
            checkDistinct(models,"modelos "+brand);
            check(models[models.length-1].equals(ViaVehicleCatalog.OTHER),
                "Falta opción manual de modelo para "+brand);
        }
        check(contains(ViaVehicleCatalog.modelsFor("Geely"),"EX5 Max"),
            "Falta EX5 Max");
        check(contains(ViaVehicleCatalog.modelsFor("BYD"),"Yuan Pro"),
            "Falta Yuan Pro");
        check(contains(ViaVehicleCatalog.modelsFor("gEeLy"),"EX5"),
            "La búsqueda de marcas debe ignorar mayúsculas");
        check(Arrays.equals(ViaVehicleCatalog.modelsFor("Marca Desconocida"),
            new String[]{ViaVehicleCatalog.OTHER}),
            "Una marca nueva debe permitir un modelo escrito a mano");
        String[] colors=ViaVehicleCatalog.colors();
        checkDistinct(colors,"colores");
        check(contains(colors,"Blanco")&&contains(colors,"Gris")&&
            contains(colors,"Negro"),"Faltan colores básicos");
        check(colors[colors.length-1].equals(ViaVehicleCatalog.OTHER),
            "Falta opción manual de color");
        String[] years=ViaVehicleCatalog.years();
        int year=Calendar.getInstance().get(Calendar.YEAR)+2;
        check(years[0].equals(String.valueOf(year)),"Año más reciente incorrecto");
        check(years[years.length-1].equals("1990"),"Falta el año 1990");
        for(int i=1;i<years.length;i++){
            check(Integer.parseInt(years[i-1])-Integer.parseInt(years[i])==1,
                "Los años deben ordenarse de más nuevo a más viejo");
        }
        System.out.println("OK V33: "+(brands.length-1)+
            " marcas, "+ViaVehicleCatalog.modelCount()+" modelos, colores editables y años");
    }
}
