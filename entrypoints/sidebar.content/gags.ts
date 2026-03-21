export const gags =
    [{
        id: "toonup",
        name: "Toon-Up",
        color: "#c659e8",
        metric: "laff",
        doesDamage: !1,
        hasLureBonus: !1,
        gags: [{
            name: "Feather",
            image: "ttr/feather.png",
            base: 10,
            organic: 12
        }, {
            name: "Megaphone",
            image: "ttr/megaphone.png",
            base: 18,
            organic: 22
        }, {
            name: "Lipstick",
            image: "ttr/lipstick.png",
            base: 30,
            organic: 36
        }, {
            name: "Bamboo Cane",
            image: "ttr/bamboo_cane.png",
            base: 45,
            organic: 54
        }, {
            name: "Pixie Dust",
            image: "ttr/pixie_dust.png",
            base: 60,
            organic: 72
        }, {
            name: "Juggling Balls",
            image: "ttr/juggling_cubes.png",
            base: 105,
            organic: 126
        }, {
            name: "High Dive",
            image: "ttr/high_dive.png",
            base: 210,
            organic: 252
        }]
    }, {
        id: "trap",
        name: "Trap",
        color: "#e8e65a",
        metric: "damage",
        doesDamage: !0,
        hasLureBonus: !1,
        gags: [{
            name: "Banana Peel",
            image: "ttr/banana_peel.png",
            base: 12,
            organic: 14,
            defeats: 2,
            organicDefeats: 2
        }, {
            name: "Rake",
            image: "ttr/rake.png",
            base: 20,
            organic: 22,
            defeats: 3,
            organicDefeats: 3
        }, {
            name: "Marbles",
            image: "ttr/marbles.png",
            base: 35,
            organic: 39,
            defeats: 4,
            organicDefeats: 4
        }, {
            name: "Quicksand",
            image: "ttr/quicksand.png",
            base: 50,
            organic: 55,
            defeats: 5,
            organicDefeats: 5
        }, {
            name: "Trapdoor",
            image: "ttr/trapdoor.png",
            base: 85,
            organic: 94,
            defeats: 7,
            organicDefeats: 8
        }, {
            name: "TNT",
            image: "ttr/tnt.png",
            base: 180,
            organic: 198,
            defeats: 11,
            organicDefeats: 12
        }, {
            name: "Railroad",
            image: "ttr/railroad.png",
            base: 200,
            organic: 220,
            defeats: 12,
            organicDefeats: 12
        }]
    }, {
        id: "lure",
        name: "Lure",
        color: "#31be35",
        metric: "base accuracy",
        metricSuffix: "%",
        doesDamage: !1,
        hasLureBonus: !1,
        gags: [{
            name: "$1 Bill",
            image: "ttr/1_bill.png",
            base: 60,
            organic: 70
        }, {
            name: "Small Magnet",
            image: "ttr/small_magnet.png",
            base: 55,
            organic: 65
        }, {
            name: "$5 Bill",
            image: "ttr/5_bill.png",
            base: 70,
            organic: 80
        }, {
            name: "Big Magnet",
            image: "ttr/big_magnet.png",
            base: 65,
            organic: 75
        }, {
            name: "$10 Bill",
            image: "ttr/10_bill.png",
            base: 80,
            organic: 90
        }, {
            name: "Hypno Goggles",
            image: "ttr/hypno_goggles.png",
            base: 75,
            organic: 85
        }, {
            name: "Presentation",
            image: "ttr/presentation.png",
            base: 90,
            organic: 95
        }]
    }, {
        id: "sound",
        name: "Sound",
        color: "#3e5ceb",
        metric: "damage",
        doesDamage: !0,
        hasLureBonus: !1,
        gags: [{
            name: "Bike Horn",
            image: "ttr/bike_horn.png",
            base: 4,
            organic: 5,
            defeats: 0,
            organicDefeats: 0
        }, {
            name: "Whistle",
            image: "ttr/whistle.png",
            base: 7,
            organic: 8,
            defeats: 1,
            organicDefeats: 1
        }, {
            name: "Bugle",
            image: "ttr/bugle.png",
            base: 11,
            organic: 13,
            defeats: 1,
            organicDefeats: 2
        }, {
            name: "Aoogah",
            image: "ttr/aoogah.png",
            base: 16,
            organic: 18,
            defeats: 2,
            organicDefeats: 2
        }, {
            name: "Elephant Trunk",
            image: "ttr/elephant_trunk.png",
            base: 21,
            organic: 24,
            defeats: 3,
            organicDefeats: 3
        }, {
            name: "Foghorn",
            image: "ttr/foghorn.png",
            base: 50,
            organic: 55,
            defeats: 5,
            organicDefeats: 5
        }, {
            name: "Opera Singer",
            image: "ttr/opera_singer.png",
            base: 90,
            organic: 99,
            defeats: 8,
            organicDefeats: 8
        }]
    }, {
        id: "throw",
        name: "Throw",
        color: "#eda032",
        metric: "damage",
        doesDamage: !0,
        hasLureBonus: !0,
        gags: [{
            name: "Cupcake",
            image: "ttr/cupcake.png",
            base: 6,
            organic: 7,
            defeats: 1,
            defeatsLure: 1,
            organicDefeats: 1,
            organicDefeatsLure: 1
        }, {
            name: "Fruit Pie Slice",
            image: "ttr/fruit_pie_slice.png",
            base: 10,
            organic: 11,
            defeats: 1,
            defeatsLure: 2,
            organicDefeats: 1,
            organicDefeatsLure: 2
        }, {
            name: "Cream Pie Slice",
            image: "ttr/cream_pie_slice.png",
            base: 17,
            organic: 19,
            defeats: 2,
            defeatsLure: 3,
            organicDefeats: 2,
            organicDefeatsLure: 3
        }, {
            name: "Whole Fruit Pie",
            image: "ttr/whole_fruit_pie.png",
            base: 27,
            organic: 30,
            defeats: 3,
            defeatsLure: 4,
            organicDefeats: 4,
            organicDefeatsLure: 5
        }, {
            name: "Whole Cream Pie",
            image: "ttr/whole_cream_pie.png",
            base: 40,
            organic: 44,
            defeats: 4,
            defeatsLure: 6,
            organicDefeats: 5,
            organicDefeatsLure: 6
        }, {
            name: "Birthday Cake",
            image: "ttr/birthday_cake.png",
            base: 100,
            organic: 110,
            defeats: 8,
            defeatsLure: 10,
            organicDefeats: 9,
            organicDefeatsLure: 11
        }, {
            name: "Wedding Cake",
            image: "ttr/wedding_cake.png",
            base: 120,
            organic: 132,
            defeats: 9,
            defeatsLure: 11,
            organicDefeats: 10,
            organicDefeatsLure: 12
        }]
    }, {
        id: "squirt",
        name: "Squirt",
        color: "#f55bd6",
        metric: "damage",
        doesDamage: !0,
        hasLureBonus: !0,
        gags: [{
            name: "Squirting Flower",
            image: "ttr/squirting_flower.png",
            base: 4,
            organic: 5,
            defeats: 0,
            defeatsLure: 1,
            organicDefeats: 0,
            organicDefeatsLure: 1
        }, {
            name: "Glass of Water",
            image: "ttr/glass_of_water.png",
            base: 8,
            organic: 10,
            defeats: 1,
            defeatsLure: 2,
            organicDefeats: 1,
            organicDefeatsLure: 2
        }, {
            name: "Squirt Gun",
            image: "ttr/squirt_gun.png",
            base: 12,
            organic: 14,
            defeats: 2,
            defeatsLure: 2,
            organicDefeats: 2,
            organicDefeatsLure: 3
        }, {
            name: "Seltzer Bottle",
            image: "ttr/seltzer_bottle.png",
            base: 21,
            organic: 25,
            defeats: 3,
            defeatsLure: 4,
            organicDefeats: 3,
            organicDefeatsLure: 4
        }, {
            name: "Fire Hose",
            image: "ttr/fire_hose.png",
            base: 30,
            organic: 35,
            defeats: 4,
            defeatsLure: 5,
            organicDefeats: 4,
            organicDefeatsLure: 5
        }, {
            name: "Storm Cloud",
            image: "ttr/storm_cloud.png",
            base: 80,
            organic: 92,
            defeats: 7,
            defeatsLure: 9,
            organicDefeats: 8,
            organicDefeatsLure: 10
        }, {
            name: "Geyser",
            image: "ttr/geyser.png",
            base: 105,
            organic: 121,
            defeats: 8,
            defeatsLure: 11,
            organicDefeats: 9,
            organicDefeatsLure: 11
        }]
    }, {
        id: "drop",
        name: "Drop",
        color: "#35eaed",
        metric: "damage",
        doesDamage: !0,
        hasLureBonus: !1,
        gags: [{
            name: "Flower Pot",
            image: "ttr/flower_pot.png",
            base: 10,
            organic: 12,
            defeats: 1,
            organicDefeats: 2
        }, {
            name: "Sandbag",
            image: "ttr/sandbag.png",
            base: 18,
            organic: 21,
            defeats: 2,
            organicDefeats: 3
        }, {
            name: "Anvil",
            image: "ttr/anvil.png",
            base: 30,
            organic: 35,
            defeats: 4,
            organicDefeats: 4
        }, {
            name: "Big Weight",
            image: "ttr/big_weight.png",
            base: 45,
            organic: 52,
            defeats: 5,
            organicDefeats: 5
        }, {
            name: "Safe",
            image: "ttr/safe.png",
            base: 70,
            organic: 81,
            defeats: 6,
            organicDefeats: 7
        }, {
            name: "Grand Piano",
            image: "ttr/grand_piano.png",
            base: 170,
            organic: 196,
            defeats: 11,
            organicDefeats: 12
        }, {
            name: "Toontanic",
            image: "ttr/toontanic.png",
            base: 180,
            organic: 207,
            defeats: 11,
            organicDefeats: 12
        }]
    }]