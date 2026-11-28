"""Rounded-square acetate rims with a fitted bridge and swept temples."""
from math import copysign, cos, pi, sin

import bpy


def fit_frames(head, material, stroke, oval, metal):
    acetate=material('Espresso and amber acetate','49362E',.35)
    shader=acetate.node_tree.nodes.get('Principled BSDF')
    shader.inputs['Coat Weight'].default_value=.24
    shader.inputs['Coat Roughness'].default_value=.25
    colour=acetate.node_tree.nodes.new('ShaderNodeVertexColor')
    colour.layer_name='Acetate'
    acetate.node_tree.links.new(colour.outputs['Color'],shader.inputs['Base Color'])
    temples=material('Espresso temples','49372F',.36)
    lens=material('Clear optical lens','EDF4F0',.20)
    glass=lens.node_tree.nodes.get('Principled BSDF')
    glass.inputs['Alpha'].default_value=.045
    lens.diffuse_color=(*lens.diffuse_color[:3],.045)
    for side in (-1,1):
        count=96
        verts=[]
        loops=[]
        for i in range(count):
            a=2*pi*i/count
            x=copysign(abs(cos(a))**.70,cos(a))
            z=copysign(abs(sin(a))**.70,sin(a))
            centre=.261
            width=.242
            height=.184
            X=side*(centre+x*width)
            Z=.787+height*z+.016*x
            Y=-.654+.091*x*x+.059*x
            # Outer corners sweep back, leaving the lid and cheek clear.
            for dx,dy,dz in [(0,-.020,0),(0,.017,0),(-.032,.015,-.030),(-.032,-.020,-.030)]:
                verts.append((X+side*x*dx,Y+dy,Z+z*dz))
            loops.append((side*(centre+x*(width-.029)),Y-.004,.787+z*(height-.027)+.016*x))
        faces=[(i*4+j,((i+1)%count)*4+j,((i+1)%count)*4+(j+1)%4,i*4+(j+1)%4)
               for i in range(count) for j in range(4)]
        if side<0:
            faces=[tuple(reversed(f)) for f in faces]
        mesh=bpy.data.meshes.new('Acetate rim')
        mesh.from_pydata(verts,[],faces)
        ob=bpy.data.objects.new('Horn rim '+str(side),mesh)
        bpy.context.collection.objects.link(ob)
        ob.parent=head
        mesh.materials.append(acetate)
        attr=mesh.color_attributes.new(name='Acetate',type='FLOAT_COLOR',domain='POINT')
        for i in range(len(verts)):
            a=(i//4)*2*pi/count
            amber=max(0,sin(5*a+side*.6)*.8+.32*sin(11*a))**2
            attr.data[i].color=(.060+.16*amber,.034+.057*amber,.024+.019*amber,1)
        for p in mesh.polygons:
            p.use_smooth=True
        bevel=ob.modifiers.new('Polished edge','BEVEL')
        bevel.width,bevel.segments=.007,3
        mesh=bpy.data.meshes.new('Fitted lens')
        centre_index=len(loops)
        tris=[(i,(i+1)%count,centre_index) for i in range(count)]
        if side<0:
            tris=[tuple(reversed(t)) for t in tris]
        mesh.from_pydata([*loops,(side*centre,-.666,.787)],[],tris)
        ob=bpy.data.objects.new('Clear lens '+str(side),mesh)
        bpy.context.collection.objects.link(ob)
        ob.parent=head
        mesh.materials.append(lens)
        for p in mesh.polygons:
            p.use_smooth=True
        stroke('Temple arm',[(side*.487,-.525,.847),(side*.557,-.433,.854),
               (side*.635,-.23,.846),(side*.686,.01,.797),(side*.688,.086,.713)],
               [.023,.024,.018,.015,.012],temples,head)
        oval('Hinge rivet',(side*.483,-.545,.844),(.011,.006,.009),metal,head)
    stroke('Saddle bridge',[(-.063,-.624,.820),(-.036,-.645,.849),(0,-.649,.854),
           (.036,-.645,.849),(.063,-.624,.820)],[.013,.016,.018,.016,.013],temples,head)
