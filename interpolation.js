var Interpolation = function (featuresValues, boundary,  colorRanges, mapSource, width = 0 , height = 0, divArea ) {
    
    this.areasValues = [];
    this.featuresValues = featuresValues;
    this.boundary = boundary;
    this.colorsRanges = colorRanges;
    this.maxResponse = Number.NEGATIVE_INFINITY;
    this.maxValue =  Math.max.apply(Math, featuresValues.map(function(o) { return o.Value; }));
    //STEP DEFAULT 6
    this.step = 2;
    this.precision =  2;
    this.map2 = mapSource;
    this.canvasWidth = width;
    this.canvasHeight = height;
    this.values = [];
    var selfInterpolation = this;
    this.initialZoom = 10 ; 
    this.boundaryCoords = [];

    this.kringConfig = {
        model: "exponential",
        sigma2: 0,
        alpha: 100
    };


    this.getExtent = function(){
        selfInterpolation .boundaryCoords = [];
        this.boundary.forEach(function(lonlat){
            selfInterpolation.boundaryCoords.push(ol.proj.fromLonLat(lonlat));
        });

        var polygon = new ol.geom.Polygon([
            selfInterpolation.boundaryCoords,            
          ]);

        var feature = new ol.Feature({
            geometry: polygon           
            
        });       
        

        selfInterpolation.initialExtent =  feature.getGeometry().getExtent();

        selfInterpolation.center = getCenterOfExtent(selfInterpolation.initialExtent);

             
    };

    function getCenterOfExtent(Extent){
        var X = Extent[0] + (Extent[2]-Extent[0])/2;
        var Y = Extent[1] + (Extent[3]-Extent[1])/2;
        return [X, Y];
    }

   
    
    this.initMap = function(callBack) {
        this.returnCallback = callBack;
       // this.createMapDiv();
        this.getExtent();
    

        var features = [];


        //--------------
        //Cria as features dos pontos de interpolacao
        featuresValues.forEach(function (myFeature) {
            var feature = new ol.Feature({
                geometry: new ol.geom.Point(ol.proj.fromLonLat(myFeature.LonLat)),
                value: myFeature.Value
            });
            feature.setStyle(new ol.style.Style({
                image: new ol.style.Circle({
                    radius: 6,
                    fill: new ol.style.Fill({
                        color: "#0F0"
                    })
                })
            }));
            features.push(feature)
        });


        //Cria os layers do mapa
        this.interpolationSource = new ol.source.Vector({
            features: features
        });
        this.interpolationLayer = new ol.layer.Vector({
            source: this.interpolationSource
        });
        
        this.map2.addLayer(this.interpolationLayer);
        this.addMapEvents();
        this.original_resolution = this.map2.getView().getResolution();
    };

    this.addMapEvents = function() {

        //Apos renderizar o mapa cria o range
        this.map2.once("postrender", function () {            
            selfInterpolation.map2.getView().fit(selfInterpolation.initialExtent, selfInterpolation.map2.getSize());
            selfInterpolation.map2.getView().setZoom(selfInterpolation.map2.getView().getZoom()-1);  
            selfInterpolation.map2.once('moveend', function(e) {
                selfInterpolation.initialZoom = selfInterpolation.map2.getView().getZoom();
                selfInterpolation.krige();
            });
        });
        
        this.map2.on("postrender", onPostRender);    

    };
    function onPostRender() {
        var e = document.getElementById("krigingCanvas"),
            a = selfInterpolation.map2.getView().getZoom();
        if (e) {
            var o = selfInterpolation.map2.getPixelFromCoordinate(selfInterpolation.center);
            e.style.top = o[1] - selfInterpolation.canvasHeight / 2 + "px", e.style.left = o[0] - selfInterpolation.canvasWidth / 2 + "px", a != selfInterpolation.map2.lastZoom && (e.style.transform = "scale(" + Math.pow(2, a - selfInterpolation.initialZoom) + ")")
        }
        selfInterpolation.map2.lastZoom = a
    };


    this.createCanvas = function() {
        var centerPixel = this.map2.getPixelFromCoordinate(this.center);
        this.canvas = document.createElement("canvas");
        this.canvas.setAttribute("id", "krigingCanvas");
        this.canvas.setAttribute("width", this.canvasWidth + "px");
        this.canvas.setAttribute("height", this.canvasHeight + "px");
        this.canvas.setAttribute("style", "position:absolute;top: " + (centerPixel[1] - this.canvasHeight / 2) + "px;left: " + (centerPixel[0] - this.canvasWidth / 2) + "px;display:none;z-index:9999;"),

        this.map2.getViewport().appendChild(this.canvas);
        this.map2.lastZoom = this.map2.getView().getZoom();
    }

    this.krige = function(){        
        this.getWidthHeightExtent();  

        this.createCanvas();

        var centerPixel = this.map2.getPixelFromCoordinate(this.center);
        
        var n, s = centerPixel[0] - this.canvasWidth / 2,
            l = centerPixel[1] - this.canvasHeight / 2;
          
        //Create rainbow 
        this.rainbow = new Rainbow();
        this.rainbow.setSpectrumByArray(this.colorsRanges);
        //500 é fixo ??
        this.rainbow.setNumberRange(0, this.maxValue);


        //Refatorar essa parte
        this.i_control = [];
        this.m_control = [];
        this.p_control = [];
        if (this.interpolationSource.forEachFeature(function (e, a) {
            var value = e.getProperties().value;
            var centerPixel2= selfInterpolation.map2.getPixelFromCoordinate(selfInterpolation.center);
            var s = centerPixel2[0] - selfInterpolation.canvasWidth / 2;
            var o = e.getGeometry().getCoordinates(),
            t = selfInterpolation.map2.getPixelFromCoordinate(o);
            
            !isNaN(value) && 0 < t[0] && t[0] < selfInterpolation.canvasWidth + s && 0 < t[1] && t[1] < selfInterpolation.canvasHeight + l && 
            (selfInterpolation.i_control.push(value), selfInterpolation.m_control.push(t[0] - s), selfInterpolation.p_control.push(t[1] - l), value > selfInterpolation.maxResponse && (selfInterpolation.maxResponse = value))
        }), 3 < this.i_control.length) {
            var variogram = kriging.train(this.i_control, this.m_control, this.p_control, this.kringConfig.model, this.kringConfig.sigma2, this.kringConfig.alpha);


            if (variogram) {
                this.map2.getView().getResolution();
                var canvas2D = this.canvas.getContext("2d");
                canvas2D.clearRect(0, 0, this.canvasWidth, this.canvasHeight);
                canvas2D.beginPath();
                this.path = canvas2D;

                

                this.boundary.forEach(function (e, a) {
                    var o = selfInterpolation.map2.getPixelFromCoordinate(ol.proj.fromLonLat(selfInterpolation.boundary[a]));
                    var t = [o[0] - centerPixel[0] + selfInterpolation.canvasWidth / 2, o[1] - centerPixel[1] + selfInterpolation.canvasHeight / 2];
                    0 === a && selfInterpolation.path.moveTo(t[0], t[1]), selfInterpolation.path.lineTo(t[0], t[1])
                }),
                this.path.closePath();
                
                var turfBoundary = turf.polygon([this.boundaryCoords]);
                

                canvas2D.clip();
                this.canvas.style.display = "block";
                for (var width_value = 1; width_value < this.canvasWidth; width_value += this.step) {
                    for (var height_value = 1; height_value < this.canvasHeight; height_value += this.step) {
                        var predictedValue = kriging.predict(width_value, height_value, variogram);                        
                        canvas2D.fillStyle = "#" + this.rainbow.colourAt(Math.round(predictedValue));
                        canvas2D.fillRect(width_value - this.step, height_value - this.step, width_value + this.step, height_value + this.step);

                        // INCLUIDO PARA O CALCULO DE AREA                         
                        if(width_value % this.precision -1 ==0 && height_value% this.precision -1 ==0){
                            var lon = width_value + (centerPixel[0] - (this.canvasWidth/2))
                            var lat = height_value + (centerPixel[1] - (this.canvasHeight/2))
                            var lonlat = this.map2.getCoordinateFromPixel([lon,lat]);
                            var turfPoint = new turf.point(lonlat);

                            if(turf.intersect(turfBoundary,turfPoint)){
                                this.values.push(
                                    {
                                        value: Math.round(predictedValue),                                
                                        LonLat: lonlat
                                    }
                                )
                            }

                        }                       

                            
                    }
                }
            }
            else console.log("Insufficient data for Interpolation on this date/time.")

        } else {
            console.log("not enough points for kriging");
        }
        this.calculateArea();
        // TODO: DESCOMENTAR PARA RETIRAR OS LAYERS APÓS O TÉRMINO
        //this.map2.removeLayer(this.interpolationLayer);
        //this.map2.removeLayer(this.areasLayer);
        this.returnCallback({
            source: this.areasSource,
            canvas: this.canvas,
            areas: this.areasValues});    

       
        
    }

    this.calculateArea = function(){
          //and finally build a function to do the buffering
        var unionPol = null; 
        var unionByValue = [];
        var featureCol = [];
        var format = new ol.format.GeoJSON();
        //Calcula a distancia entre os pontos pra definir a area de buffer
        var from = turf.point(ol.proj.transform(this.values[0].LonLat, 'EPSG:3857','EPSG:4326'));
        var to = turf.point(ol.proj.transform(this.values[1].LonLat, 'EPSG:3857','EPSG:4326'));
        var options = {units: 'meters'};

        var distance = turf.distance(from, to, options);



        //ISSO AQUI DA PRA SER RESOLVIDO COM UM DISSOLVE - VER DEPOIS, AO INVES DE UTILIZAR UNION
        var featureCollection = []
        for(var i=0; i< this.values.length;i++){
            var  valueFeat = this.values[i];
            //Gera um buffer do ponto            
            
           var point = turf.point(ol.proj.transform(valueFeat.LonLat, 'EPSG:3857','EPSG:4326'));
            var buffered = turf.buffer(point, distance/1.8, {units: 'meters'});
            var pointFeature = format.readFeature(point);
            pointFeature.getGeometry().transform('EPSG:4326', 'EPSG:3857');
            
            var pointFeature =  new ol.Feature({
                geometry: pointFeature
            });
            pointFeature.setStyle(new ol.style.Style({
                image: new ol.style.Circle({
                    radius: 6,
                    fill: new ol.style.Fill({
                        color: "#F00"
                    })
                })
            }));
           
            //featureCol.push(currentPolygon);
            var bufferedPolygon  =turf.bboxPolygon(turf.bbox(buffered));
            featureCollection.push(turf.polygon(bufferedPolygon, {value:valueFeat.value}));

            var poligonUnion = unionByValue.find(function(item){
                return item.value == valueFeat.value; 
            })
            if(poligonUnion){
                poligonUnion.union.push(bufferedPolygon);
            }else{
                unionByValue.push({
                    value:valueFeat.value,
                    union : [bufferedPolygon]
                });                
            }
        }        

        //var dissolved  =  turf.dissolve(turf.featureCollection(featureCollection), {propertyName: 'value'});

        this.areasSource = new ol.source.Vector({
            features: []
        });
        this.areasLayer = new ol.layer.Vector({
            source: this.areasSource
        });        
        this.map2.addLayer(this.areasLayer);
        this.coIndex = 0 ;
        for(var i=0 ; i<unionByValue.length; i++){
            var unionObj = unionByValue[i];
            var format = new ol.format.GeoJSON();
            var unionResult = turf.union.apply(this,unionObj.union);

            var polyFeature = format.readFeature(unionResult);
            polyFeature.getGeometry().transform('EPSG:4326', 'EPSG:3857');

            var color = '#' + this.rainbow.colourAt(Math.round(unionObj.value));
    
            /*stroke: new ol.style.Stroke({
                color: 'blue',
                width: 1
              }),*/
            polyFeature.setStyle(new ol.style.Style({
                  
                    fill: new ol.style.Fill({
                      color: hexToRgbA(color)
                    })
                  }));
           
            
            selfInterpolation.coIndex++;
        
            selfInterpolation.areasSource.addFeature(polyFeature);
            

            selfInterpolation.areasValues.push({
                value: unionObj.value,
                area: turf.area(unionResult)
            } );
        };        
    }
   
    function hexToRgbA(hex){
        var c;
        if(/^#([A-Fa-f0-9]{3}){1,2}$/.test(hex)){
            c= hex.substring(1).split('');
            if(c.length== 3){
                c= [c[0], c[0], c[1], c[1], c[2], c[2]];
            }
            c= '0x'+c.join('');
            return 'rgba('+[(c>>16)&255, (c>>8)&255, c&255].join(',')+',1)';
        }
        throw new Error('Bad Hex');
    }

    this.getWidthHeightExtent = function(){

        var xmin = this.initialExtent[0];
        var xmax = this.initialExtent[2];
        var ymin = this.initialExtent[1];
        var ymax = this.initialExtent[3];

        var fromPixel =  selfInterpolation.map2.getPixelFromCoordinate([xmin,ymax]);
        var toPixel =  selfInterpolation.map2.getPixelFromCoordinate([xmax,ymin]);

        var widthPixel = toPixel[0] - fromPixel[0];
        var heightPixel = toPixel[1] - fromPixel[1];

        this.canvasWidth = Math.abs(widthPixel);
        this.canvasHeight =Math.abs(heightPixel); 

    }
    
    
}